import { MediaItem, MediaType } from "./media";

export interface CatalogFilter {
  genre?: string;
  year?: string;
  status?: string;
  sort?: string;
  type?: MediaType;
  provider?: string;
  searchQuery?: string;
  page?: number;
}

export interface CatalogResponse {
  items: MediaItem[];
  totalItems?: number;
  currentPage: number;
  totalPages: number;
  hasNextPage?: boolean;
}

export interface CustomTag {
  id: string;
  name: string;
  color?: string;
  visible?: boolean;
  order?: number;
}
