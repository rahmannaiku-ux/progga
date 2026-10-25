"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CollegeField } from "@/components/auth/college-field";
import { DistrictField } from "@/components/auth/district-field";
import { officialDistrictName } from "@/lib/bd-districts";
import { confirmSchoolDetailsAction } from "@/server/actions/student-profile-actions";

type Errors = Partial<Record<"district" | "collegeName" | "collegeEIIN", string>>;

/**
 * One-time check for students who filled in their profile before the official lists: pick the
 * district from the 64 and the college from the institution list. What they typed before is
 * filled in to start from.
 */
export function ConfirmSchoolForm({ initial }: { initial: { district: string; collegeName: string; collegeEIIN: string } }) {
  const router = useRouter();
  const [district, setDistrict] = useState(officialDistrictName(initial.district) ?? initial.district);
  const [college, setCollege] = useState({ name: initial.collegeName, eiin: initial.collegeEIIN });
  const [notListed, setNotListed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await confirmSchoolDetailsAction({
          district,
          collegeName: college.name,
          collegeEIIN: college.eiin,
          collegeNotListed: notListed,
        });
        if (result.ok) {
          router.replace("/dashboard");
          router.refresh();
        } else if (result.reason === "validation") {
          setErrors(result.fieldErrors);
        } else {
          setFormError("We couldn't find your profile. Please sign in again.");
        }
      } catch {
        router.push("/login");
      }
    });
  }

  return (
    <form onSubmit={submit} className="comic-panel-bold space-y-4 bg-surface p-5">
      <DistrictField id="confirm-district" value={district} onChange={setDistrict} error={errors.district} required disabled={isPending} />
      <CollegeField
        idPrefix="confirm"
        name={college.name}
        eiin={college.eiin}
        onChange={setCollege}
        notListed={notListed}
        onNotListedChange={setNotListed}
        nameError={errors.collegeName}
        eiinError={errors.collegeEIIN}
        required
        disabled={isPending}
      />
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : "Save and continue"}
      </Button>
    </form>
  );
}
