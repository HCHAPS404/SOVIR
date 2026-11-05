"use client";

import { useEffect } from "react";

// Fires the file download once when the page loads — arriving at a platform
// download page means intent (from the coverage strip or the index list).
export function AutoDownload({ file }: { file: string }) {
  useEffect(() => {
    const a = document.createElement("a");
    a.href = file;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [file]);
  return null;
}
