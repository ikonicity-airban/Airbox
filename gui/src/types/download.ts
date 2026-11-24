export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "error";

export interface DownloadTask {
  epid: string | number;
  title: string;
  caption: string;
  totalSegments: number;
  currentSegments: number;
  status?: DownloadStatus;
  speed?: string;
  eta?: string;
  progress?: number;
}

export interface WebDownloadFormat {
  formatId: string;
  ext: string;
  resolution?: string;
  note?: string;
  filesize?: number;
  vcodec?: string;
  acodec?: string;
}

export interface WebMediaAnalysis {
  title: string;
  thumbnail?: string;
  duration?: number;
  formats: WebDownloadFormat[];
}

export interface WebDownloadJob {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  formatId: string;
  progress: number;
  speed?: string;
  eta?: string;
  status: "pending" | "downloading" | "completed" | "error";
  destinationPath: string;
  error?: string;
}
