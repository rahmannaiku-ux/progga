import { genUploader } from "uploadthing/client";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

// Plain client uploader rather than @uploadthing/react: that package's v6 line
// only supports React 18, and the app only needs to start an upload.
export const uploadFiles = genUploader<OurFileRouter>({
  url: "/api/uploadthing",
  package: "uploadthing/client",
});
