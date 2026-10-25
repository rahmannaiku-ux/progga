import fs from "node:fs";
import path from "node:path";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { ImageResponse } from "next/og";
import type { AdPose, AdTemplate } from "@/lib/ad-studio/catalog";

/*
 * Draws the Ad Studio templates (catalog.ts) as PNGs with next/og (Satori):
 * the same look as the site (Baloo 2 / Inter, the comic ink outlines and hard
 * shadows, Proggy). Satori lays out with flexbox only: every element with
 * more than one child is display:flex, and images need a width and height.
 */

const INK = "#1F1433";
const PURPLE = "#53328B";
const VIOLET = "#6B1FC1";
const GOLD = "#FAB719";
const DEEP = "#2A1645";
const CREAM = "#FCF9F3";
const LILAC = "#E7DDF8";
const MUTED = "#5B5170";
const BODY = "#3B2F55";
const RED = "#BC2F1A";
const DISPLAY = "Baloo, Hind";
const TEXT = "Inter, Hind";

const POSE_SIZE: Record<AdPose, [number, number]> = {
  excited: [475, 676],
  pointing: [291, 427],
  sad: [301, 432],
  thinking: [284, 586],
  "thumbs-up": [295, 588],
  waving: [303, 419],
  welcome: [431, 587],
  working: [331, 435],
};

type Assets = {
  logo: string;
  pose: { src: string; w: number; h: number } | null;
  poses: Record<AdPose, string>;
  photo: string | null;
};
/** Every text field key any template uses (catalog.ts); each template is only given its own. */
type FieldKey =
  | "mission" | "date" | "body" | "price" | "mentor" | "starts" | "patrols" | "live" | "oldPrice" | "note"
  | "percent" | "line" | "code" | "until" | "headline" | "p1" | "p2" | "p3" | "p4" | "one" | "oneMeta" | "two"
  | "twoMeta" | "save" | "topic" | "time" | "name" | "role" | "c1" | "c2" | "c3" | "quote" | "o1" | "m1" | "o2"
  | "m2" | "o3" | "m3" | "o4" | "m4" | "s1" | "t1" | "s2" | "t2" | "s3" | "t3" | "days" | "hours" | "closes"
  | "exam" | "minutes" | "marks" | "syllabus" | "n1" | "n2" | "n3" | "hero" | "certNo" | "patrol"
  | "you" | "friend" | "d1" | "d2" | "d3" | "d4" | "d5" | "d6" | "t4" | "t5" | "t6" | "p5" | "tests" | "stat"
  | "statLabel" | "college" | "why" | "xp" | "author" | "apply" | "year";
type V = Record<FieldKey, string>;

let cache: { logo: string; poses: Record<AdPose, string>; fonts: { name: string; data: Buffer; weight: 400 | 600 | 700 | 800 }[] } | null = null;

function loadStatic() {
  if (cache) return cache;
  // Each path.join spells out its folder literally: a folder passed in as a
  // variable makes Turbopack trace (and deploy) the whole project.
  const png = (file: string) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  const poses = Object.fromEntries(
    (Object.keys(POSE_SIZE) as AdPose[]).map((p) => [
      p,
      png(path.join(process.cwd(), "public", "character", "proggy", `${p}.png`)),
    ])
  ) as Record<AdPose, string>;
  const adFont = (file: string) => fs.readFileSync(path.join(process.cwd(), "src", "lib", "ad-studio", "fonts", file));
  const hindFont = (file: string) => fs.readFileSync(path.join(process.cwd(), "src", "lib", "certificate", "fonts", file));
  cache = {
    logo: png(path.join(process.cwd(), "public", "branding", "proggaa-logo-512.png")),
    poses,
    fonts: [
      { name: "Baloo", data: adFont("Baloo2-ExtraBold.woff"), weight: 800 },
      { name: "Baloo", data: adFont("Baloo2-SemiBold.woff"), weight: 600 },
      { name: "Inter", data: adFont("Inter-Regular.woff"), weight: 400 },
      { name: "Inter", data: adFont("Inter-Bold.woff"), weight: 700 },
      // Bangla text and the ৳ sign
      { name: "Hind", data: hindFont("HindSiliguri-Regular.ttf"), weight: 400 },
      { name: "Hind", data: hindFont("HindSiliguri-Bold.ttf"), weight: 700 },
    ],
  };
  return cache;
}

/** Renders one template to a PNG response. */
export function renderAd(template: AdTemplate, values: Record<string, string>, pose: AdPose | null, photo: string | null): ImageResponse {
  const s = loadStatic();
  const chosen = pose ?? template.pose;
  const assets: Assets = {
    logo: s.logo,
    poses: s.poses,
    pose: chosen ? { src: s.poses[chosen], w: POSE_SIZE[chosen][0], h: POSE_SIZE[chosen][1] } : null,
    photo,
  };
  const draw = DRAW[template.id];
  if (!draw) throw new Error(`No drawing for template ${template.id}`);
  return new ImageResponse(draw(values as V, assets), {
    width: template.width,
    height: template.height,
    fonts: s.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: "normal" as const })),
  });
}

// --- shared pieces ---------------------------------------------------------

const dots = (color: string, base: string, size = 28) => ({
  backgroundColor: base,
  backgroundImage: `radial-gradient(circle, ${color} 2px, transparent 2.6px)`,
  backgroundSize: `${size}px ${size}px`,
});

function Frame({ w, h, style, children }: { w: number; h: number; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ width: w, height: h, display: "flex", position: "relative", overflow: "hidden", fontFamily: TEXT, color: INK, ...style }}>
      {children}
    </div>
  );
}

function Brand({ a, light = false, size = 84, style }: { a: Assets; light?: boolean; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, position: "absolute", ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={a.logo} width={size} height={size} />
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: Math.round(size * 0.46), color: light ? "#FFFFFF" : INK }}>Prooggaa</div>
    </div>
  );
}

function Proggy({ a, height, style, flip }: { a: Assets; height: number; style: CSSProperties; flip?: boolean }) {
  if (!a.pose) return null;
  const width = Math.round((a.pose.w * height) / a.pose.h);
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={a.pose.src} width={width} height={height} style={{ position: "absolute", ...style, ...(flip ? { transform: "scaleX(-1)" } : {}) }} />
  );
}

function PoseImg({ a, pose, height, style }: { a: Assets; pose: AdPose; height: number; style: CSSProperties }) {
  const [w, h] = POSE_SIZE[pose];
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={a.poses[pose]} width={Math.round((w * height) / h)} height={height} style={{ position: "absolute", ...style }} />;
}

function Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 24px",
        background: GOLD,
        border: `4px solid ${INK}`,
        borderRadius: 999,
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: 28,
        color: INK,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Check({ size = 40 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 12, background: GOLD, border: `3px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5 9-10" />
      </svg>
    </div>
  );
}

function PhotoBox({ a, w, h, radius, label, style }: { a: Assets; w: number; h: number; radius: number; label: string; style?: CSSProperties }) {
  if (a.photo) {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={a.photo} width={w} height={h} style={{ objectFit: "cover", borderRadius: radius, ...style }} />;
  }
  return (
    <div style={{ width: w, height: h, borderRadius: radius, background: LILAC, display: "flex", alignItems: "center", justifyContent: "center", color: PURPLE, fontWeight: 700, fontSize: 22, ...style }}>
      {label}
    </div>
  );
}

const taka = (v: string) => `৳${v}`;

// --- the templates -----------------------------------------------------------

type Draw = (v: V, a: Assets) => ReactElement;

const DRAW: Record<string, Draw> = {
  launch: (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.09)", CREAM)}>
      <div style={{ position: "absolute", right: -140, top: -140, width: 620, height: 620, borderRadius: 999, background: VIOLET, opacity: 0.18 }} />
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <Pill style={{ position: "absolute", right: 72, top: 82, boxShadow: `5px 5px 0 ${INK}`, transform: "rotate(4deg)" }}>NEW MISSION</Pill>
      <div style={{ position: "absolute", left: 72, top: 240, width: 600, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: PURPLE }}>{v.date}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 100, lineHeight: 0.95 }}>{v.mission}</div>
        <div style={{ fontSize: 31, lineHeight: 1.4, color: BODY }}>{v.body}</div>
        <div style={{ display: "flex", gap: 14 }}>
          {["Live classes", "Encounters", "Medal"].map((t) => (
            <div key={t} style={{ padding: "10px 20px", border: `3px solid ${INK}`, borderRadius: 999, background: "#FFFFFF", fontWeight: 700, fontSize: 24 }}>{t}</div>
          ))}
        </div>
      </div>
      <Proggy a={a} height={600} style={{ right: 40, bottom: 150 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 132, background: DEEP, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 72px" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, color: "#FFFFFF" }}>Enrol now: prooggaa.com</div>
        <div style={{ padding: "12px 30px", background: GOLD, border: "4px solid #FFFFFF", borderRadius: 18, fontFamily: DISPLAY, fontWeight: 800, fontSize: 36 }}>{taka(v.price)}</div>
      </div>
    </Frame>
  ),

  enroll: (v, a) => (
    <Frame w={1080} h={1080} style={{ ...dots("rgba(255,255,255,0.10)", DEEP, 32), color: "#FFFFFF" }}>
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 190, display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 124, lineHeight: 0.9, color: GOLD }}>Enrolment</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 124, lineHeight: 0.9 }}>is open!</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 470, width: 600, padding: "34px 40px", background: "#FFFFFF", color: INK, border: `4px solid ${INK}`, borderRadius: 28, boxShadow: `10px 10px 0 ${GOLD}`, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 50, lineHeight: 1 }}>{v.mission}</div>
        <div style={{ display: "flex", flexWrap: "wrap", rowGap: 12, columnGap: 24, fontSize: 24 }}>
          <div style={{ width: 240 }}>{`Mentor: ${v.mentor}`}</div>
          <div style={{ width: 240 }}>{`Starts: ${v.starts}`}</div>
          <div style={{ width: 240 }}>{`Patrols: ${v.patrols}`}</div>
          <div style={{ width: 240 }}>{`Live: ${v.live}`}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: PURPLE }}>{taka(v.price)}</div>
          <div style={{ fontSize: 26, color: MUTED, textDecoration: "line-through", paddingBottom: 12 }}>{taka(v.oldPrice)}</div>
        </div>
      </div>
      <Proggy a={a} height={640} flip style={{ right: 30, bottom: 120 }} />
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 44, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: LILAC }}>{v.note}</div>
        <Pill style={{ fontSize: 34, padding: "14px 34px", boxShadow: "5px 5px 0 #000000" }}>prooggaa.com</Pill>
      </div>
    </Frame>
  ),

  "early-bird": (v, a) => (
    <Frame w={1080} h={1080} style={{ background: GOLD }}>
      <div style={{ position: "absolute", right: -160, top: 60, width: 760, height: 760, borderRadius: 999, background: "rgba(255,255,255,0.28)" }} />
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 200, display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 46 }}>Early-bird offer</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 220, lineHeight: 0.85, color: DEEP }}>{`${v.percent}%`}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, lineHeight: 0.9, color: DEEP }}>OFF</div>
        <div style={{ marginTop: 18, fontSize: 32, fontWeight: 700, width: 520, lineHeight: 1.35 }}>{v.line}</div>
      </div>
      <Proggy a={a} height={620} style={{ right: 70, top: 150 }} />
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 72, height: 170, display: "flex", background: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 26, boxShadow: `10px 10px 0 ${INK}` }}>
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 40px", gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: MUTED, letterSpacing: 2 }}>USE COUPON CODE</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, letterSpacing: 6, color: PURPLE }}>{v.code}</div>
        </div>
        <div style={{ width: 0, borderLeft: `5px dashed ${INK}`, margin: "18px 0" }} />
        <div style={{ width: 330, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Valid until</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40 }}>{v.until}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: PURPLE }}>prooggaa.com</div>
        </div>
      </div>
    </Frame>
  ),

  free: (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.09)", CREAM)}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 390, background: PURPLE }} />
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 170, width: 620, fontFamily: DISPLAY, fontWeight: 800, fontSize: 76, lineHeight: 1, color: "#FFFFFF" }}>{v.headline}</div>
      <div style={{ position: "absolute", right: 90, top: 92, width: 250, height: 250, borderRadius: 999, background: GOLD, border: `6px solid ${INK}`, boxShadow: `8px 8px 0 ${INK}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: "rotate(-10deg)" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 92, lineHeight: 0.9 }}>FREE</div>
        <div style={{ fontWeight: 700, fontSize: 24 }}>৳0 · no card</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 450, width: 560, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 56, lineHeight: 1 }}>{v.mission}</div>
        {[v.p1, v.p2, v.p3, v.p4].map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 700 }}>
            <Check />
            <div>{p}</div>
          </div>
        ))}
        <div style={{ display: "flex", marginTop: 12 }}>
          <div style={{ padding: "18px 36px", background: VIOLET, color: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 999, boxShadow: `6px 6px 0 ${INK}`, fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>Join free at prooggaa.com</div>
        </div>
      </div>
      <Proggy a={a} height={620} style={{ right: 40, bottom: 40 }} />
    </Frame>
  ),

  bundle: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: VIOLET, padding: "64px 72px", flexDirection: "column", gap: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 84 }}>
        <Brand a={a} light style={{ position: "relative" }} />
        <Pill style={{ background: "#FFFFFF" }}>BUNDLE DEAL</Pill>
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontFamily: DISPLAY, fontWeight: 800, fontSize: 92, lineHeight: 0.95 }}>
        <div style={{ color: "#FFFFFF" }}>Two Missions.</div>
        <div style={{ color: GOLD }}>One price.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {[
          [v.one, v.oneMeta, "MISSION 1"],
          [v.two, v.twoMeta, "MISSION 2"],
        ].map(([title, meta, tag], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {i === 1 ? (
              <div style={{ width: 76, height: 76, borderRadius: 999, background: GOLD, border: `4px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 56 }}>+</div>
            ) : null}
            <div style={{ width: 380, height: 280, padding: 30, background: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 26, boxShadow: `8px 8px 0 ${INK}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex" }}>
                <div style={{ padding: "6px 16px", background: LILAC, borderRadius: 999, fontWeight: 700, fontSize: 20, color: PURPLE }}>{tag}</div>
              </div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, lineHeight: 1 }}>{title}</div>
              <div style={{ fontSize: 24, color: MUTED }}>{meta}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", padding: "26px 36px", background: GOLD, border: `4px solid ${INK}`, borderRadius: 26, boxShadow: `8px 8px 0 ${INK}`, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Together for only</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 76, lineHeight: 0.95 }}>{taka(v.price)}</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{`You save ${taka(v.save)} · prooggaa.com`}</div>
        </div>
        <Proggy a={a} height={250} style={{ right: 20, bottom: 10 }} />
      </div>
    </Frame>
  ),

  live: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: INK, color: "#FFFFFF" }}>
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", right: 72, top: 82, display: "flex", alignItems: "center", gap: 12, padding: "12px 26px", background: RED, borderRadius: 999, fontFamily: DISPLAY, fontWeight: 800, fontSize: 30 }}>
        <div style={{ width: 18, height: 18, borderRadius: 999, background: "#FFFFFF" }} />
        <div>LIVE CLASS</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 210, width: 936, height: 470, background: CREAM, border: `5px solid ${GOLD}`, borderRadius: 30, overflow: "hidden", color: INK, display: "flex", flexDirection: "column" }}>
        <div style={{ height: 54, background: GOLD, display: "flex", alignItems: "center", gap: 12, padding: "0 24px" }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: INK }} />
          <div style={{ width: 16, height: 16, borderRadius: 999, background: INK, opacity: 0.6 }} />
          <div style={{ width: 16, height: 16, borderRadius: 999, background: INK, opacity: 0.3 }} />
          <div style={{ marginLeft: 12, fontWeight: 700, fontSize: 22 }}>{`${v.mission} · Live`}</div>
        </div>
        <div style={{ padding: "44px 48px", width: 580, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: PURPLE }}>TODAY&apos;S TOPIC</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, lineHeight: 0.98 }}>{v.topic}</div>
          <div style={{ fontSize: 28, color: BODY }}>{`with ${v.mentor}`}</div>
        </div>
        <Proggy a={a} height={370} style={{ right: 30, top: 90 }} />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 740, display: "flex", gap: 24 }}>
        {[
          ["Date", v.date],
          ["Time", v.time],
          ["Where", "Prooggaa app"],
        ].map(([k, val]) => (
          <div key={k} style={{ flex: 1, padding: "26px 28px", border: "3px solid #5B4A80", borderRadius: 22, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#C9BCE6" }}>{k}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40 }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 72, bottom: 60, fontSize: 28, fontWeight: 700, color: GOLD }}>Enrolled Heroes join from Live Classes on prooggaa.com</div>
    </Frame>
  ),

  mentor: (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.09)", CREAM)}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <Pill style={{ position: "absolute", right: 72, top: 84, background: PURPLE, color: "#FFFFFF", border: "none" }}>MEET YOUR MENTOR</Pill>
      <div style={{ position: "absolute", left: 72, top: 210, display: "flex", border: `5px solid ${INK}`, borderRadius: 34, boxShadow: `12px 12px 0 ${GOLD}`, overflow: "hidden" }}>
        <PhotoBox a={a} w={430} h={530} radius={0} label="Add the mentor photo" />
      </div>
      <div style={{ position: "absolute", left: 570, top: 230, width: 440, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 72, lineHeight: 0.95 }}>{v.name}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: PURPLE }}>{v.role}</div>
        {[v.c1, v.c2, v.c3].map((c, i) => (
          <div key={i} style={{ fontSize: 26, lineHeight: 1.35 }}>{`• ${c}`}</div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 72, height: 200, padding: "32px 40px 32px 230px", background: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 28, display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 33, lineHeight: 1.15 }}>{`“${v.quote}”`}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: PURPLE }}>{`Teaching ${v.mission} · prooggaa.com`}</div>
      </div>
      <Proggy a={a} height={260} style={{ left: 60, bottom: 72 }} />
    </Frame>
  ),

  roadmap: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: "#FFFFFF", padding: "64px 72px", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 84 }}>
        <Brand a={a} style={{ position: "relative" }} />
        <div style={{ fontSize: 26, fontWeight: 700, color: PURPLE }}>Mission roadmap</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", margin: "34px 0 38px", fontFamily: DISPLAY, fontWeight: 800, fontSize: 72, lineHeight: 0.95 }}>
        <div>What you&apos;ll master in</div>
        <div style={{ color: VIOLET }}>{v.mission}</div>
      </div>
      <div style={{ position: "relative", width: 640, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ position: "absolute", left: 33, top: 30, bottom: 30, width: 6, background: LILAC, borderRadius: 3 }} />
        {[
          [v.o1, v.m1],
          [v.o2, v.m2],
          [v.o3, v.m3],
          [v.o4, v.m4],
          ["Final Encounter + Medal", "A certificate anyone can verify"],
        ].map(([title, meta], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 999, background: i === 4 ? GOLD : PURPLE, color: i === 4 ? INK : "#FFFFFF", border: `4px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>{i === 4 ? <svg width="34" height="34" viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z" fill={INK} /></svg> : String(i + 1)}</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, lineHeight: 1.1 }}>{title}</div>
              <div style={{ fontSize: 22, color: MUTED }}>{meta}</div>
            </div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={500} style={{ right: 60, bottom: 140 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 96, background: GOLD, borderTop: `4px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>Full syllabus at prooggaa.com</div>
    </Frame>
  ),

  "how-it-works": (v, a) => (
    <Frame w={1080} h={1080} style={{ background: PURPLE, padding: "64px 60px", flexDirection: "column", gap: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 84 }}>
        <Brand a={a} light style={{ position: "relative" }} />
        <div style={{ fontSize: 26, fontWeight: 700, color: GOLD }}>prooggaa.com</div>
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 84, lineHeight: 0.95, color: "#FFFFFF", width: 860 }}>{v.headline}</div>
      <div style={{ flexGrow: 1, display: "flex", gap: 22 }}>
        {(
          [
            [v.s1, v.t1, "welcome", 300],
            [v.s2, v.t2, "working", 250],
            [v.s3, v.t3, "excited", 300],
          ] as [string, string, AdPose, number][]
        ).map(([title, text, pose, h], i) => (
          <div key={i} style={{ flex: 1, position: "relative", background: CREAM, border: `4px solid ${INK}`, borderRadius: 24, boxShadow: `8px 8px 0 ${INK}`, padding: 26, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
            <div style={{ width: 58, height: 58, borderRadius: 999, background: GOLD, border: `3px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 32 }}>{String(i + 1)}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, lineHeight: 1 }}>{title}</div>
            <div style={{ fontSize: 22, lineHeight: 1.35, color: BODY }}>{text}</div>
            <PoseImg a={a} pose={pose} height={h} style={{ left: 24, bottom: -10 }} />
          </div>
        ))}
      </div>
    </Frame>
  ),

  countdown: (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.09)", CREAM)}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 96, background: RED, display: "flex", alignItems: "center", justifyContent: "center", gap: 20, color: "#FFFFFF", fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, letterSpacing: 3 }}>
        <div>HURRY</div>
        <div>·</div>
        <div>LAST CHANCE</div>
        <div>·</div>
        <div>HURRY</div>
      </div>
      <Brand a={a} style={{ left: 72, top: 140 }} />
      <div style={{ position: "absolute", left: 72, top: 260, width: 620, fontFamily: DISPLAY, fontWeight: 800, fontSize: 68, lineHeight: 0.98 }}>{`Enrolment for ${v.mission} closes in`}</div>
      <div style={{ position: "absolute", left: 72, top: 560, display: "flex", gap: 22 }}>
        {(
          [
            [v.days, "DAYS"],
            [v.hours, "HOURS"],
          ] as [string, string][]
        ).map(([num, label], i) => (
          <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 22 }}>
            {i === 1 ? <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 100, lineHeight: 1.5, color: RED }}>:</div> : null}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {num.padStart(2, "0").slice(0, 2).split("").map((d, j) => (
                  <div key={j} style={{ width: 120, height: 170, background: INK, color: "#FFFFFF", borderRadius: 20, boxShadow: `6px 6px 0 ${RED}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 130 }}>{d}</div>
                ))}
              </div>
              <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={430} style={{ right: 50, top: 330 }} />
      <div style={{ position: "absolute", right: 120, top: 250, padding: "14px 24px", background: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 22, fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, transform: "rotate(-4deg)" }}>Don&apos;t miss it!</div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 34px", background: GOLD, border: `4px solid ${INK}`, borderRadius: 24, boxShadow: `8px 8px 0 ${INK}` }}>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{v.closes}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 38 }}>prooggaa.com</div>
      </div>
    </Frame>
  ),

  exam: (v, a) => (
    <Frame w={1080} h={1080} style={{ backgroundColor: "#FFFDF6", backgroundImage: "linear-gradient(transparent 55px, #D8E3F2 55px, #D8E3F2 58px)", backgroundSize: "100% 58px" }}>
      <div style={{ position: "absolute", left: 150, top: 0, bottom: 0, width: 4, background: "#E8A0A0" }} />
      <Brand a={a} size={80} style={{ left: 190, top: 60 }} />
      <Pill style={{ position: "absolute", right: 72, top: 76, background: VIOLET, color: "#FFFFFF", borderRadius: 14, transform: "rotate(3deg)" }}>ENCOUNTER ALERT</Pill>
      <div style={{ position: "absolute", left: 190, top: 210, width: 520, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 80, lineHeight: 0.95 }}>{`${v.exam} is coming`}</div>
        <div style={{ fontSize: 28, lineHeight: 1.4, color: BODY }}>{`For Heroes of ${v.mission}. Revise, then beat it to earn XP.`}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {[
            ["Date", v.date],
            ["Time", v.time],
            ["Duration", `${v.minutes} min`],
            ["Marks", v.marks],
          ].map(([k, val]) => (
            <div key={k} style={{ width: 252, padding: "18px 22px", background: "#FFFFFF", border: `3px solid ${INK}`, borderRadius: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: MUTED }}>{k}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{`Syllabus: ${v.syllabus}`}</div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>Where: Exams on prooggaa.com</div>
      </div>
      <Proggy a={a} height={640} style={{ right: 36, bottom: 60 }} />
    </Frame>
  ),

  "top-heroes": (v, a) => {
    const step = (name: string, score: string, place: number) => {
      const first = place === 1;
      const block = { 1: 280, 2: 210, 3: 160 }[place] ?? 160;
      const color = { 1: GOLD, 2: "#C9BCE6", 3: "#E8B07A" }[place] ?? GOLD;
      const ring = first ? 180 : 150;
      return (
        <div key={place} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: ring, height: ring, borderRadius: 999, background: LILAC, border: `${first ? 6 : 5}px solid ${first ? GOLD : "#FFFFFF"}`, display: "flex", alignItems: "center", justifyContent: "center", color: PURPLE, fontFamily: DISPLAY, fontWeight: 800, fontSize: first ? 84 : 70 }}>
            {(name.replace(/[^\p{L}]/gu, "")[0] ?? "?").toUpperCase()}
          </div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: first ? 40 : 34, textAlign: "center" }}>{name}</div>
          <div style={{ fontSize: first ? 26 : 24, fontWeight: 700, color: first ? GOLD : LILAC }}>{`${score} marks`}</div>
          <div style={{ alignSelf: "stretch", height: block, background: color, border: `4px solid ${INK}`, borderBottom: "none", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "center", paddingTop: 16, color: INK, fontFamily: DISPLAY, fontWeight: 800, fontSize: first ? 104 : 80 }}>{String(place)}</div>
        </div>
      );
    };
    return (
      <Frame w={1080} h={1080} style={{ backgroundColor: DEEP, backgroundImage: `radial-gradient(circle, ${GOLD} 3px, transparent 3.6px)`, backgroundSize: "90px 90px", color: "#FFFFFF" }}>
        <Brand a={a} light style={{ left: 72, top: 64 }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 180, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: GOLD }}>{`${v.exam} results`}</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 104, lineHeight: 0.95 }}>Top Heroes</div>
        </div>
        <div style={{ position: "absolute", left: 90, right: 90, bottom: 0, display: "flex", alignItems: "flex-end", gap: 24 }}>
          {step(v.n2, v.s2, 2)}
          {step(v.n1, v.s1, 1)}
          {step(v.n3, v.s3, 3)}
        </div>
      </Frame>
    );
  },

  medal: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: PURPLE, padding: 54 }}>
      <div style={{ position: "relative", width: "100%", height: "100%", background: CREAM, border: `6px solid ${INK}`, borderRadius: 30, boxShadow: `12px 12px 0 ${INK}`, padding: 40, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 18, top: 18, right: 18, bottom: 18, border: `3px dashed ${GOLD}`, borderRadius: 20 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={a.logo} width={72} height={72} />
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>Prooggaa</div>
        </div>
        <svg width="200" height="230" viewBox="0 0 200 230" style={{ marginTop: 26 }}>
          <path d="M62 120 L40 225 L78 205 L100 228 L108 130 Z" fill={VIOLET} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <path d="M138 120 L160 225 L122 205 L100 228 L92 130 Z" fill={PURPLE} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
          <circle cx="100" cy="88" r="78" fill={GOLD} stroke={INK} strokeWidth="6" />
          <circle cx="100" cy="88" r="56" fill="none" stroke={INK} strokeWidth="4" strokeDasharray="6 8" />
          <path d="M100 52 L111 76 L137 79 L118 96 L123 122 L100 109 L77 122 L82 96 L63 79 L89 76 Z" fill="#FFFFFF" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        </svg>
        <div style={{ marginTop: 22, fontSize: 26, fontWeight: 700, letterSpacing: 4, color: PURPLE }}>MEDAL EARNED</div>
        <div style={{ marginTop: 10, fontFamily: DISPLAY, fontWeight: 800, fontSize: 88, lineHeight: 1, textAlign: "center" }}>{v.hero}</div>
        <div style={{ marginTop: 14, fontSize: 30, lineHeight: 1.4, width: 720, textAlign: "center", justifyContent: "center" }}>completed every Patrol and beat the final Encounter of</div>
        <div style={{ marginTop: 6, fontFamily: DISPLAY, fontWeight: 800, fontSize: 50, lineHeight: 1.05, color: VIOLET, textAlign: "center" }}>{v.mission}</div>
        <div style={{ marginTop: "auto", alignSelf: "stretch", display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 20px", fontSize: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ color: MUTED }}>Certificate ID</div>
            <div style={{ fontWeight: 700, fontSize: 26 }}>{v.certNo}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <div style={{ color: MUTED }}>Verify it at</div>
            <div style={{ fontWeight: 700, fontSize: 26 }}>prooggaa.com/certificates/verify</div>
          </div>
        </div>
      </div>
    </Frame>
  ),

  review: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: GOLD }}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", right: 72, top: 86, fontFamily: DISPLAY, fontWeight: 800, fontSize: 30 }}>What Heroes say</div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 200, height: 500, padding: "56px 60px", background: "#FFFFFF", border: `5px solid ${INK}`, borderRadius: 40, boxShadow: `12px 12px 0 ${INK}`, display: "flex", flexDirection: "column", gap: 26 }}>
        <svg width="90" height="70" viewBox="0 0 90 70">
          <path d="M8 66V40C8 18 20 6 40 2v14C28 20 24 28 24 38h16v28zM50 66V40C50 18 62 6 82 2v14C70 20 66 28 66 38h16v28z" fill={VIOLET} />
        </svg>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 48, lineHeight: 1.12 }}>{v.quote}</div>
        <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <svg key={i} width="42" height="42" viewBox="0 0 24 24">
              <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z" fill={GOLD} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 695, width: 0, height: 0, borderLeft: "30px solid transparent", borderRight: "30px solid transparent", borderTop: `50px solid ${INK}` }} />
      <div style={{ position: "absolute", left: 72, top: 780, display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", border: `5px solid ${INK}`, borderRadius: 999, overflow: "hidden" }}>
          <PhotoBox a={a} w={130} h={130} radius={999} label="Photo" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, lineHeight: 1 }}>{v.hero}</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{`Hero of ${v.mission}`}</div>
        </div>
      </div>
      <Proggy a={a} height={370} style={{ right: 60, bottom: -30 }} />
    </Frame>
  ),

  streak: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: CREAM }}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 200, display: "flex", alignItems: "center", gap: 26 }}>
        <svg width="170" height="210" viewBox="0 0 170 210">
          <path d="M85 6C95 50 150 70 150 130a65 65 0 0 1-130 0c0-36 22-54 30-80 10 18 14 30 26 34C90 60 80 34 85 6Z" fill={RED} stroke={INK} strokeWidth="7" strokeLinejoin="round" />
          <path d="M85 100c6 22 34 30 34 58a34 34 0 0 1-68 0c0-18 10-26 14-38 6 8 8 12 14 14 2-12 2-22 6-34Z" fill={GOLD} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 170, lineHeight: 0.85, color: RED }}>{v.days}</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 54, lineHeight: 1 }}>day streak</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 470, width: 600, fontFamily: DISPLAY, fontWeight: 800, fontSize: 68, lineHeight: 0.98 }}>{v.headline}</div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 770, padding: "28px 34px", background: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 26, boxShadow: `8px 8px 0 ${INK}`, display: "flex", justifyContent: "space-between" }}>
        {["Sat", "Sun", "Mon", "Tue", "Wed", "Today", "Fri"].map((d, i) => (
          <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 22, color: i === 5 ? RED : i === 6 ? MUTED : INK }}>{d}</div>
            {i < 5 ? (
              <div style={{ width: 64, height: 64, borderRadius: 999, background: GOLD, border: `3px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              </div>
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 999, background: i === 5 ? "#FFFFFF" : "#F3EFE6", border: i === 5 ? `4px dashed ${RED}` : "3px solid #D9D1C2" }} />
            )}
          </div>
        ))}
      </div>
      <Proggy a={a} height={540} flip style={{ right: 30, top: 190 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", fontSize: 28, fontWeight: 700, color: PURPLE }}>Open the app or prooggaa.com</div>
    </Frame>
  ),

  "story-enroll": (v, a) => (
    <Frame w={1080} h={1920} style={{ ...dots("rgba(255,255,255,0.12)", VIOLET, 36), color: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", justifyContent: "center" }}>
        <Brand a={a} light size={96} style={{ position: "relative" }} />
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <Pill style={{ fontSize: 34, padding: "12px 28px" }}>NEW MISSION</Pill>
        <div style={{ marginTop: 10, fontFamily: DISPLAY, fontWeight: 800, fontSize: 124, lineHeight: 0.92, textAlign: "center" }}>{v.mission}</div>
        <div style={{ fontSize: 38, lineHeight: 1.35, color: "#EFE7FB", textAlign: "center" }}>{v.body}</div>
      </div>
      <Proggy a={a} height={560} style={{ left: 540 - Math.round(((a.pose?.w ?? 0) * 560) / (a.pose?.h ?? 1) / 2), top: 920 }} />
      <div style={{ position: "absolute", left: 80, right: 80, top: 1460, padding: "30px 40px", background: "#FFFFFF", color: INK, border: `5px solid ${INK}`, borderRadius: 34, boxShadow: `10px 10px 0 ${INK}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: MUTED }}>{`Starts ${v.date}`}</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, lineHeight: 1, color: PURPLE }}>{taka(v.price)}</div>
        </div>
        <Pill style={{ fontSize: 38, padding: "20px 34px" }}>Tap the link</Pill>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1660, display: "flex", justifyContent: "center", fontSize: 32, fontWeight: 700 }}>prooggaa.com</div>
    </Frame>
  ),

  "story-live": (v, a) => (
    <Frame w={1080} h={1920} style={{ background: INK, color: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: -200, top: 520, width: 1480, height: 1480, borderRadius: 999, background: DEEP }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 230, display: "flex", justifyContent: "center" }}>
        <Brand a={a} light size={96} style={{ position: "relative" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 390, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 36px", background: RED, borderRadius: 999, fontFamily: DISPLAY, fontWeight: 800, fontSize: 44 }}>
          <div style={{ width: 24, height: 24, borderRadius: 999, background: "#FFFFFF" }} />
          <div>LIVE NOW</div>
        </div>
        <div style={{ width: 900, fontFamily: DISPLAY, fontWeight: 800, fontSize: 108, lineHeight: 0.95, textAlign: "center", justifyContent: "center" }}>{v.topic}</div>
        <div style={{ fontSize: 38, color: "#C9BCE6" }}>{`${v.mission} · with ${v.mentor}`}</div>
      </div>
      <Proggy a={a} height={520} style={{ left: 540 - Math.round(((a.pose?.w ?? 0) * 520) / (a.pose?.h ?? 1) / 2), top: 900 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 1480, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <Pill style={{ fontSize: 50, padding: "26px 70px", border: "5px solid #FFFFFF" }}>Join the class</Pill>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#C9BCE6" }}>{`Started ${v.time} · Live Classes on prooggaa.com`}</div>
      </div>
    </Frame>
  ),

  app: (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.09)", CREAM)}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 220, width: 520, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 92, lineHeight: 0.92 }}>{v.headline}</div>
        <div style={{ fontSize: 30, lineHeight: 1.4, color: BODY }}>{v.body}</div>
        {["Android", "Windows"].map((os) => (
          <div key={os} style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 26px", background: INK, color: "#FFFFFF", borderRadius: 20, boxShadow: `6px 6px 0 ${GOLD}` }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {os === "Android" ? <rect x="6" y="2" width="12" height="20" rx="2.5" /> : <rect x="3" y="4" width="18" height="12" rx="2" />}
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 20, color: "#C9BCE6" }}>Download for</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{os}</div>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 28, fontWeight: 700, color: PURPLE }}>prooggaa.com/download</div>
      </div>
      <div style={{ position: "absolute", right: 90, top: 150, width: 380, height: 790, background: INK, borderRadius: 56, padding: 16, boxShadow: `14px 14px 0 ${VIOLET}`, transform: "rotate(4deg)", display: "flex" }}>
        <div style={{ width: "100%", height: "100%", background: CREAM, borderRadius: 42, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ padding: "34px 24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
              <img src={a.logo} width={44} height={44} />
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 }}>Hey, Hero!</div>
            </div>
            <div style={{ padding: 18, background: GOLD, border: `3px solid ${INK}`, borderRadius: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 }}>Resume your Patrol</div>
              <div style={{ height: 14, border: `2px solid ${INK}`, borderRadius: 7, background: "#FFFFFF", display: "flex" }}>
                <div style={{ width: "62%", height: "100%", background: VIOLET, borderRadius: 5 }} />
              </div>
            </div>
            <div style={{ padding: 16, background: "#FFFFFF", border: `3px solid ${INK}`, borderRadius: 18, fontSize: 17, fontWeight: 700 }}>Live class today</div>
            <div style={{ padding: 16, background: "#FFFFFF", border: `3px solid ${INK}`, borderRadius: 18, fontSize: 17, fontWeight: 700 }}>Encounter this week</div>
          </div>
          <Proggy a={a} height={230} style={{ left: 100, bottom: 70 }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 64, borderTop: `3px solid ${INK}`, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "space-around" }}>
            <div style={{ width: 40, height: 26, borderRadius: 13, background: GOLD, border: `2px solid ${INK}` }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: 22, height: 22, borderRadius: 6, border: `3px solid ${MUTED}` }} />
            ))}
          </div>
        </div>
      </div>
    </Frame>
  ),

  "facebook-cover": (v, a) => (
    <Frame w={1640} h={624} style={{ ...dots("rgba(255,255,255,0.10)", PURPLE, 30), color: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 150, background: DEEP }} />
      <PoseImg a={a} pose="waving" height={340} style={{ left: 230, bottom: 30 }} />
      <div style={{ position: "absolute", left: 520, right: 520, top: 80, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Brand a={a} light size={96} style={{ position: "relative" }} />
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 54, lineHeight: 1, textAlign: "center", justifyContent: "center" }}>{v.headline}</div>
        <Pill style={{ marginTop: 10, fontSize: 32, padding: "12px 30px" }}>prooggaa.com</Pill>
      </div>
      <Proggy a={a} height={400} style={{ right: 230, bottom: 26 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 48, display: "flex", justifyContent: "center", gap: 22, fontWeight: 700, fontSize: 26, color: LILAC }}>
        <div>Live classes</div>
        <div>·</div>
        <div>Encounters</div>
        <div>·</div>
        <div>Medals</div>
        <div>·</div>
        <div>Community</div>
      </div>
    </Frame>
  ),

  youtube: (v, a) => (
    <Frame w={1280} h={720} style={{ background: GOLD }}>
      <div style={{ position: "absolute", right: -120, top: -160, width: 760, height: 1040, background: VIOLET, transform: "rotate(14deg)", borderLeft: `8px solid ${INK}` }} />
      <Brand a={a} size={74} style={{ left: 56, top: 46 }} />
      <div style={{ position: "absolute", left: 56, top: 160, padding: "10px 24px", background: INK, color: GOLD, borderRadius: 14, fontFamily: DISPLAY, fontWeight: 800, fontSize: 36 }}>{`PATROL ${v.patrol}`}</div>
      <div style={{ position: "absolute", left: 56, top: 240, width: 700, fontFamily: DISPLAY, fontWeight: 800, fontSize: 124, lineHeight: 0.9, color: INK, textShadow: "6px 6px 0 #FFFFFF" }}>{v.topic}</div>
      <div style={{ position: "absolute", left: 56, bottom: 50, fontSize: 30, fontWeight: 700 }}>{v.mission}</div>
      <Proggy a={a} height={640} flip style={{ right: 120, bottom: -20 }} />
    </Frame>
  ),
  // --- More templates (2026-10) --------------------------------------------------

  scholarship: (v, a) => (
    <Frame w={1080} h={1080} style={{ ...dots("rgba(255,255,255,0.10)", PURPLE, 30), color: "#FFFFFF" }}>
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <Pill style={{ position: "absolute", right: 72, top: 84, boxShadow: `5px 5px 0 ${INK}` }}>FREE TO SIT</Pill>
      <div style={{ position: "absolute", left: 72, top: 220, width: 620, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 108, lineHeight: 0.92, color: GOLD }}>{v.headline}</div>
        <div style={{ fontSize: 36, lineHeight: 1.3, fontWeight: 700 }}>{v.line}</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 640, display: "flex", gap: 20 }}>
        {[
          ["Date", v.date],
          ["Time", v.time],
        ].map(([k, val]) => (
          <div key={k} style={{ width: 260, padding: "22px 26px", background: "#FFFFFF", color: INK, border: `4px solid ${INK}`, borderRadius: 22, boxShadow: `7px 7px 0 ${GOLD}`, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: MUTED }}>{k}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40 }}>{val}</div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={600} style={{ right: 50, bottom: 110 }} />
      <div style={{ position: "absolute", left: 72, bottom: 60, fontSize: 28, fontWeight: 700, color: LILAC }}>{v.note}</div>
    </Frame>
  ),

  referral: (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.08)", CREAM)}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 200, width: 640, fontFamily: DISPLAY, fontWeight: 800, fontSize: 92, lineHeight: 0.95 }}>{v.headline}</div>
      <div style={{ position: "absolute", left: 72, top: 470, width: 540, display: "flex", flexDirection: "column", gap: 20 }}>
        {[
          ["YOU GET", v.you, GOLD],
          ["YOUR FRIEND GETS", v.friend, LILAC],
        ].map(([k, val, bg]) => (
          <div key={k} style={{ padding: "24px 30px", background: bg, border: `4px solid ${INK}`, borderRadius: 24, boxShadow: `8px 8px 0 ${INK}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: INK }}>{k}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, lineHeight: 1 }}>{val}</div>
          </div>
        ))}
        <div style={{ fontSize: 26, lineHeight: 1.4, color: BODY }}>{v.note}</div>
      </div>
      <Proggy a={a} height={480} style={{ right: 40, bottom: 120 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 100, background: PURPLE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: "#FFFFFF" }}>prooggaa.com</div>
    </Frame>
  ),

  "flash-sale": (v, a) => (
    <Frame w={1080} h={1080} style={{ background: RED, color: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: -200, top: 380, width: 1500, height: 170, background: GOLD, transform: "rotate(-8deg)", borderTop: `6px solid ${INK}`, borderBottom: `6px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: INK, letterSpacing: 3 }}>{`FLASH SALE · ${v.hours} HOURS ONLY`}</div>
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 190, width: 900, fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, lineHeight: 1 }}>{v.mission}</div>
      <div style={{ position: "absolute", left: 72, top: 630, width: 620, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 40, fontWeight: 700, textDecoration: "line-through", opacity: 0.75 }}>{taka(v.oldPrice)}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 120, lineHeight: 0.95 }}>{taka(v.price)}</div>
      </div>
      <Proggy a={a} height={430} style={{ right: 50, bottom: 50 }} />
      <div style={{ position: "absolute", left: 72, bottom: 64, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 700 }}>{v.closes}</div>
        <Pill style={{ fontSize: 32, boxShadow: `5px 5px 0 ${INK}` }}>prooggaa.com</Pill>
      </div>
    </Frame>
  ),

  "free-class": (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.08)", CREAM)}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", right: 72, top: 70, width: 220, height: 220, borderRadius: 999, background: GOLD, border: `6px solid ${INK}`, boxShadow: `8px 8px 0 ${INK}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: "rotate(-8deg)" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, lineHeight: 0.9 }}>FREE</div>
        <div style={{ fontWeight: 700, fontSize: 24 }}>demo class</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 230, width: 620, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: PURPLE }}>{v.mission}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 92, lineHeight: 0.95 }}>{v.topic}</div>
        <div style={{ fontSize: 30, color: BODY }}>{`with ${v.mentor}`}</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 650, display: "flex", gap: 20 }}>
        {[v.date, v.time].map((t, i) => (
          <div key={i} style={{ padding: "18px 30px", background: PURPLE, color: "#FFFFFF", borderRadius: 18, border: `4px solid ${INK}`, fontFamily: DISPLAY, fontWeight: 800, fontSize: 40 }}>{t}</div>
        ))}
      </div>
      <Proggy a={a} height={560} style={{ right: 60, bottom: 40 }} />
      <div style={{ position: "absolute", left: 72, bottom: 72, display: "flex" }}>
        <div style={{ padding: "16px 32px", background: VIOLET, color: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 999, boxShadow: `6px 6px 0 ${INK}`, fontFamily: DISPLAY, fontWeight: 800, fontSize: 32 }}>Join free at prooggaa.com</div>
      </div>
    </Frame>
  ),

  routine: (v, a) => (
    <Frame w={1080} h={1350} style={{ background: "#FFFFFF", padding: "64px 72px", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 84 }}>
        <Brand a={a} style={{ position: "relative" }} />
        <Pill>CLASS ROUTINE</Pill>
      </div>
      <div style={{ marginTop: 34, fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, lineHeight: 1, color: PURPLE }}>{v.mission}</div>
      <div style={{ marginTop: 36, width: 700, display: "flex", flexDirection: "column", border: `4px solid ${INK}`, borderRadius: 26, overflow: "hidden" }}>
        {[
          [v.d1, v.t1],
          [v.d2, v.t2],
          [v.d3, v.t3],
          [v.d4, v.t4],
          [v.d5, v.t5],
          [v.d6, v.t6],
        ].map(([d, t], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", height: 112, background: i % 2 ? CREAM : "#FFFFFF", borderTop: i ? `2px solid ${LILAC}` : "none" }}>
            <div style={{ width: 220, height: "100%", display: "flex", alignItems: "center", paddingLeft: 30, background: i % 2 ? LILAC : "#F1EAFB", fontFamily: DISPLAY, fontWeight: 800, fontSize: 32 }}>{d}</div>
            <div style={{ paddingLeft: 30, fontSize: 30, fontWeight: 700, color: BODY }}>{t}</div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={520} style={{ right: 40, bottom: 120 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 96, background: GOLD, borderTop: `4px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>Live classes on prooggaa.com</div>
    </Frame>
  ),

  "new-patrol": (v, a) => (
    <Frame w={1080} h={1080} style={{ background: DEEP, color: "#FFFFFF" }}>
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <Pill style={{ position: "absolute", right: 72, top: 84 }}>NEW PATROL</Pill>
      <div style={{ position: "absolute", left: 72, top: 220, width: 936, height: 520, background: CREAM, color: INK, border: `5px solid ${GOLD}`, borderRadius: 30, display: "flex", flexDirection: "column", padding: "48px 52px", gap: 18 }}>
        <div style={{ display: "flex" }}>
          <div style={{ padding: "8px 22px", background: INK, color: GOLD, borderRadius: 14, fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>{`PATROL ${v.patrol}`}</div>
        </div>
        <div style={{ width: 560, fontFamily: DISPLAY, fontWeight: 800, fontSize: 78, lineHeight: 0.98 }}>{v.topic}</div>
        <div style={{ fontSize: 28, color: BODY }}>{`${v.mission} · ${v.minutes} min`}</div>
        <Proggy a={a} height={420} style={{ right: 40, bottom: 0 }} />
      </div>
      <div style={{ position: "absolute", left: 72, bottom: 90, display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 84, height: 84, borderRadius: 999, background: GOLD, border: `4px solid #FFFFFF`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="38" height="38" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill={INK} /></svg>
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40 }}>Watch it now on prooggaa.com</div>
      </div>
    </Frame>
  ),

  qna: (v, a) => (
    <Frame w={1080} h={1080} style={{ ...dots("rgba(31,20,51,0.08)", LILAC) }}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 200, width: 640, padding: "40px 44px", background: "#FFFFFF", border: `5px solid ${INK}`, borderRadius: 40, boxShadow: `10px 10px 0 ${INK}`, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: PURPLE }}>LIVE Q&amp;A</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 84, lineHeight: 0.95 }}>{v.headline}</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: BODY }}>{v.topic}</div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 560, width: 0, height: 0, borderLeft: "40px solid transparent", borderRight: "40px solid transparent", borderTop: `60px solid ${INK}` }} />
      <div style={{ position: "absolute", left: 72, top: 690, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{`with ${v.mentor}`}</div>
        <div style={{ display: "flex", gap: 16 }}>
          {[v.date, v.time].map((t, i) => (
            <div key={i} style={{ padding: "14px 26px", background: PURPLE, color: "#FFFFFF", borderRadius: 16, fontFamily: DISPLAY, fontWeight: 800, fontSize: 36 }}>{t}</div>
          ))}
        </div>
      </div>
      <Proggy a={a} height={600} style={{ right: 60, bottom: 60 }} />
      <div style={{ position: "absolute", left: 72, bottom: 60, fontSize: 28, fontWeight: 700, color: PURPLE }}>Join from Live Classes on prooggaa.com</div>
    </Frame>
  ),

  "exam-tips": (v, a) => (
    <Frame w={1080} h={1350} style={{ background: CREAM, padding: "64px 72px", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", height: 84 }}>
        <Brand a={a} style={{ position: "relative" }} />
      </div>
      <div style={{ marginTop: 40, width: 820, fontFamily: DISPLAY, fontWeight: 800, fontSize: 84, lineHeight: 0.95 }}>{v.headline}</div>
      <div style={{ marginTop: 44, width: 700, display: "flex", flexDirection: "column", gap: 22 }}>
        {[v.p1, v.p2, v.p3, v.p4, v.p5].map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22, padding: "20px 26px", background: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 22, boxShadow: `6px 6px 0 ${i % 2 ? VIOLET : GOLD}` }}>
            <div style={{ width: 62, height: 62, flexShrink: 0, borderRadius: 999, background: i % 2 ? VIOLET : GOLD, color: i % 2 ? "#FFFFFF" : INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>{String(i + 1)}</div>
            <div style={{ fontSize: 31, fontWeight: 700, lineHeight: 1.25 }}>{t}</div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={330} style={{ right: 40, bottom: 24 }} />
      <div style={{ position: "absolute", left: 72, bottom: 64, fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: PURPLE }}>Good luck from Prooggaa</div>
    </Frame>
  ),

  "model-test": (v, a) => (
    <Frame w={1080} h={1080} style={{ background: VIOLET, color: "#FFFFFF", padding: "64px 72px", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 84 }}>
        <Brand a={a} light style={{ position: "relative" }} />
        <Pill>{`${v.tests} TESTS`}</Pill>
      </div>
      <div style={{ marginTop: 40, width: 760, fontFamily: DISPLAY, fontWeight: 800, fontSize: 88, lineHeight: 0.95 }}>{v.headline}</div>
      <div style={{ marginTop: 20, fontSize: 32, fontWeight: 700, color: GOLD }}>{`Starts ${v.starts}`}</div>
      <div style={{ marginTop: 40, width: 600, display: "flex", flexDirection: "column", gap: 18 }}>
        {[v.p1, v.p2, v.p3].map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
            <Check />
            <div>{p}</div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={520} style={{ right: 50, bottom: 150 }} />
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 64, height: 110, background: GOLD, color: INK, border: `4px solid ${INK}`, borderRadius: 24, boxShadow: `8px 8px 0 ${INK}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 36px" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 38 }}>Register at prooggaa.com</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 52 }}>{taka(v.price)}</div>
      </div>
    </Frame>
  ),

  "exam-routine": (v, a) => (
    <Frame w={1080} h={1350} style={{ background: DEEP, color: "#FFFFFF", padding: "64px 72px", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 84 }}>
        <Brand a={a} light style={{ position: "relative" }} />
        <Pill>EXAM ROUTINE</Pill>
      </div>
      <div style={{ marginTop: 40, fontFamily: DISPLAY, fontWeight: 800, fontSize: 72, lineHeight: 1, color: GOLD }}>{v.headline}</div>
      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16 }}>
        {[
          [v.d1, v.t1],
          [v.d2, v.t2],
          [v.d3, v.t3],
          [v.d4, v.t4],
          [v.d5, v.t5],
        ].map(([d, t], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, height: 118, padding: "0 30px", background: "rgba(255,255,255,0.08)", border: "3px solid #5B4A80", borderRadius: 22 }}>
            <div style={{ width: 200, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#C9BCE6" }}>{`EXAM ${i + 1}`}</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: GOLD }}>{d}</div>
            </div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 42 }}>{t}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 64, fontSize: 30, fontWeight: 700, color: LILAC }}>{v.note}</div>
    </Frame>
  ),

  "results-congrats": (v, a) => (
    <Frame w={1080} h={1080} style={{ background: GOLD }}>
      <div style={{ position: "absolute", left: -120, top: -120, width: 700, height: 700, borderRadius: 999, background: "rgba(255,255,255,0.3)" }} />
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <Pill style={{ position: "absolute", right: 72, top: 84, background: PURPLE, color: "#FFFFFF" }}>{v.exam}</Pill>
      <div style={{ position: "absolute", left: 72, top: 210, width: 640, fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, lineHeight: 0.95, color: DEEP }}>{v.headline}</div>
      <div style={{ position: "absolute", left: 72, top: 470, width: 540, display: "flex", flexDirection: "column", padding: "30px 40px", background: "#FFFFFF", border: `5px solid ${INK}`, borderRadius: 28, boxShadow: `10px 10px 0 ${INK}` }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 112, lineHeight: 0.95, color: PURPLE }}>{v.stat}</div>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{v.statLabel}</div>
      </div>
      <Proggy a={a} height={560} style={{ right: 30, bottom: 60 }} />
      <div style={{ position: "absolute", left: 72, bottom: 72, width: 560, fontSize: 30, fontWeight: 700, lineHeight: 1.35, color: DEEP }}>{v.note}</div>
    </Frame>
  ),

  "hero-of-week": (v, a) => (
    <Frame w={1080} h={1080} style={{ ...dots("rgba(255,255,255,0.10)", PURPLE, 30), color: "#FFFFFF" }}>
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <Pill style={{ position: "absolute", right: 72, top: 84 }}>HERO OF THE WEEK</Pill>
      <div style={{ position: "absolute", left: 72, top: 210, display: "flex", border: `6px solid ${GOLD}`, borderRadius: 999, overflow: "hidden" }}>
        <PhotoBox a={a} w={380} h={380} radius={999} label="Add the Hero's photo" />
      </div>
      <div style={{ position: "absolute", left: 500, top: 240, width: 520, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 76, lineHeight: 0.95, color: GOLD }}>{v.hero}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: LILAC }}>{v.college}</div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "flex-end", gap: 10 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64 }}>{v.xp}</div>
          <div style={{ fontSize: 26, fontWeight: 700, paddingBottom: 12 }}>XP this week</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 72, height: 230, padding: "34px 300px 34px 40px", background: "#FFFFFF", color: INK, border: `4px solid ${INK}`, borderRadius: 28, display: "flex", alignItems: "center", fontSize: 32, fontWeight: 700, lineHeight: 1.3 }}>{v.why}</div>
      <Proggy a={a} height={360} style={{ right: 90, bottom: 72 }} />
    </Frame>
  ),

  quote: (v, a) => (
    <Frame w={1080} h={1080} style={dots("rgba(31,20,51,0.08)", CREAM)}>
      <Brand a={a} style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 170, fontFamily: DISPLAY, fontWeight: 800, fontSize: 260, lineHeight: 1, color: GOLD }}>“</div>
      <div style={{ position: "absolute", left: 72, top: 330, width: 900, fontFamily: DISPLAY, fontWeight: 800, fontSize: 70, lineHeight: 1.08 }}>{v.quote}</div>
      <div style={{ position: "absolute", left: 72, top: 720, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 60, height: 6, background: VIOLET, borderRadius: 3 }} />
        <div style={{ fontSize: 34, fontWeight: 700, color: PURPLE }}>{v.author}</div>
      </div>
      <Proggy a={a} height={420} style={{ right: 60, bottom: 40 }} />
      <div style={{ position: "absolute", left: 72, bottom: 64, fontSize: 28, fontWeight: 700, color: MUTED }}>prooggaa.com</div>
    </Frame>
  ),

  stats: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: DEEP, color: "#FFFFFF", padding: "64px 72px", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", height: 84 }}>
        <Brand a={a} light style={{ position: "relative" }} />
      </div>
      <div style={{ marginTop: 40, fontFamily: DISPLAY, fontWeight: 800, fontSize: 92, lineHeight: 0.95, color: GOLD }}>{v.headline}</div>
      <div style={{ marginTop: 50, width: 600, display: "flex", flexDirection: "column", gap: 24 }}>
        {[
          [v.s1, v.t1],
          [v.s2, v.t2],
          [v.s3, v.t3],
        ].map(([n, t], i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 22, paddingBottom: 18, borderBottom: "3px solid #5B4A80" }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: LILAC }}>{t}</div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={600} style={{ right: 40, bottom: 60 }} />
      <div style={{ position: "absolute", left: 72, bottom: 64, display: "flex" }}>
        <Pill style={{ fontSize: 32 }}>prooggaa.com</Pill>
      </div>
    </Frame>
  ),

  hiring: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 420, background: VIOLET }} />
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 190, display: "flex", flexDirection: "column", color: "#FFFFFF" }}>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD }}>WE&apos;RE HIRING</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, lineHeight: 0.95 }}>{v.role}</div>
      </div>
      <div style={{ position: "absolute", left: 72, top: 480, width: 580, display: "flex", flexDirection: "column", gap: 22 }}>
        {[v.p1, v.p2, v.p3].map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 700 }}>
            <Check />
            <div>{p}</div>
          </div>
        ))}
      </div>
      <Proggy a={a} height={560} style={{ right: 60, bottom: 130 }} />
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 64, height: 110, background: GOLD, border: `4px solid ${INK}`, borderRadius: 24, boxShadow: `8px 8px 0 ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 38 }}>{v.apply}</div>
    </Frame>
  ),

  eid: (v, a) => (
    <Frame w={1080} h={1080} style={{ ...dots("rgba(250,183,25,0.18)", DEEP, 34), color: "#FFFFFF" }}>
      <div style={{ position: "absolute", right: 120, top: 120, width: 260, height: 260, borderRadius: 999, background: GOLD }} />
      <div style={{ position: "absolute", right: 70, top: 90, width: 250, height: 250, borderRadius: 999, background: DEEP }} />
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 300, width: 700, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 130, lineHeight: 0.9, color: GOLD }}>{v.headline}</div>
        <div style={{ fontSize: 36, lineHeight: 1.35 }}>{v.body}</div>
      </div>
      <Proggy a={a} height={500} style={{ right: 60, bottom: 40 }} />
      <div style={{ position: "absolute", left: 72, bottom: 72, fontSize: 30, fontWeight: 700, color: LILAC }}>{v.note}</div>
    </Frame>
  ),

  boishakh: (v, a) => (
    <Frame w={1080} h={1080} style={{ background: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 40, background: RED }} />
      <div style={{ position: "absolute", left: 0, bottom: 0, width: 1080, height: 40, background: RED }} />
      <div style={{ position: "absolute", right: -140, top: 150, width: 640, height: 640, borderRadius: 999, background: "#FCE8C4" }} />
      <Brand a={a} style={{ left: 72, top: 90 }} />
      <div style={{ position: "absolute", left: 72, top: 270, width: 640, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 104, lineHeight: 1.02, color: RED }}>{v.headline}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 90, lineHeight: 1, color: INK }}>{v.year}</div>
        <div style={{ fontSize: 34, lineHeight: 1.35, color: BODY }}>{v.body}</div>
      </div>
      <Proggy a={a} height={560} style={{ right: 60, bottom: 70 }} />
    </Frame>
  ),

  "national-day": (v, a) => (
    <Frame w={1080} h={1080} style={{ background: "#006A4E", color: "#FFFFFF" }}>
      <div style={{ position: "absolute", left: 470, top: 300, width: 420, height: 420, borderRadius: 999, background: "#F42A41" }} />
      <Brand a={a} light style={{ left: 72, top: 64 }} />
      <div style={{ position: "absolute", left: 72, top: 240, width: 560, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 36, fontWeight: 700 }}>{v.date}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 112, lineHeight: 0.95 }}>{v.headline}</div>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 90, fontSize: 36, lineHeight: 1.35, fontWeight: 700 }}>{v.body}</div>
    </Frame>
  ),

  "story-offer": (v, a) => (
    <Frame w={1080} h={1920} style={{ background: GOLD }}>
      <div style={{ position: "absolute", right: -200, top: 300, width: 900, height: 900, borderRadius: 999, background: "rgba(255,255,255,0.3)" }} />
      <Brand a={a} size={100} style={{ left: 80, top: 120 }} />
      <div style={{ position: "absolute", left: 80, top: 330, display: "flex", flexDirection: "column" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 300, lineHeight: 0.85, color: DEEP }}>{`${v.percent}%`}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 140, lineHeight: 0.9, color: DEEP }}>OFF</div>
        <div style={{ marginTop: 30, width: 860, fontFamily: DISPLAY, fontWeight: 800, fontSize: 72, lineHeight: 1 }}>{v.mission}</div>
      </div>
      <Proggy a={a} height={720} style={{ right: 60, bottom: 520 }} />
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 200, height: 240, display: "flex", background: "#FFFFFF", border: `5px solid ${INK}`, borderRadius: 32, boxShadow: `12px 12px 0 ${INK}` }}>
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 44px", gap: 6 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: MUTED, letterSpacing: 2 }}>COUPON CODE</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 84, letterSpacing: 6, color: PURPLE }}>{v.code}</div>
        </div>
        <div style={{ width: 300, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", borderLeft: `5px dashed ${INK}` }}>
          <div style={{ fontSize: 28, fontWeight: 700 }}>Valid until</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 44 }}>{v.until}</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 90, display: "flex", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 44 }}>prooggaa.com</div>
    </Frame>
  ),

  "story-exam": (v, a) => (
    <Frame w={1080} h={1920} style={{ ...dots("rgba(255,255,255,0.08)", DEEP, 34), color: "#FFFFFF" }}>
      <Brand a={a} light size={100} style={{ left: 80, top: 120 }} />
      <div style={{ position: "absolute", left: 80, top: 330, width: 920, fontFamily: DISPLAY, fontWeight: 800, fontSize: 96, lineHeight: 0.95 }}>{v.exam}</div>
      <div style={{ position: "absolute", left: 80, top: 560, width: 520, height: 520, borderRadius: 999, background: GOLD, color: INK, border: `8px solid #FFFFFF`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 260, lineHeight: 0.85 }}>{v.days}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 56 }}>days left</div>
      </div>
      <Proggy a={a} height={680} style={{ right: 50, top: 760 }} />
      <div style={{ position: "absolute", left: 80, top: 1200, width: 640, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 44, fontWeight: 700, color: GOLD }}>{v.date}</div>
        <div style={{ fontSize: 40, lineHeight: 1.35 }}>{v.body}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 120, display: "flex", justifyContent: "center" }}>
        <Pill style={{ fontSize: 44, padding: "18px 44px" }}>prooggaa.com</Pill>
      </div>
    </Frame>
  ),
};

/** For tests: every catalog template must have a drawing. */
export const DRAWN_TEMPLATE_IDS = Object.keys(DRAW);
