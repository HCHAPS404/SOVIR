export interface DownloadItem {
  id: string;
  label: string;
  /** Fichero servido desde /downloads cuando existe; ausente = aún no publicado */
  file?: string;
  size?: string;
  note: string;
}

export const downloads: DownloadItem[] = [
  {
    id: "android",
    label: "Android",
    file: "/web/downloads/sovir-android.apk",
    size: "11.7 MB",
    note: "APK de observador — instalación manual",
  },
  {
    id: "extension",
    label: "Extensión de navegador",
    file: "/web/downloads/sovir-extension.zip",
    size: "7.3 MB",
    note: "Chrome, Edge y navegadores Chromium",
  },
  { id: "windows", label: "Windows", note: "Próximamente" },
  { id: "apple", label: "Mac", note: "Próximamente" },
];

export type DownloadId = (typeof downloads)[number]["id"];

export function findDownload(id: string) {
  return downloads.find((item) => item.id === id);
}
