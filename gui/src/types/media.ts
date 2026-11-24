export type MediaType = "Anime" | "Manga" | "Movies";

export interface SubtitleTrack {
  label: string;
  file: string;
  kind?: string;
  default?: boolean;
}

export interface MediaSource {
  quality: string;
  url: string;
  isM3U8?: boolean;
  headers?: Record<string, string>;
  subtitles?: SubtitleTrack[];
}

export interface Episode {
  id: string;
  epid: string | number;
  number: number;
  title?: string;
  url?: string;
  season?: number;
  isFiller?: boolean;
  aired?: string;
}

export interface MediaSeason {
  seasonNumber: number;
  title: string;
  episodes: Episode[];
}

export interface MediaItem {
  id: string | number;
  malid?: string | number;
  MalID?: string | number;
  title: string;
  name?: string;
  type?: MediaType;
  image?: string;
  poster?: string;
  banner?: string;
  description?: string;
  synopsis?: string;
  rating?: number | string;
  year?: number | string;
  episodesCount?: number;
  genres?: string[];
  status?: string;
  provider?: string;
  CustomTag?: string;
}
