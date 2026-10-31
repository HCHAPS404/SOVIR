export const downloads = [
  { id: "apple", label: "Mac" },
  { id: "windows", label: "Windows" },
] as const;

export type DownloadId = (typeof downloads)[number]["id"];

export function findDownload(id: string) {
  return downloads.find((item) => item.id === id);
}
