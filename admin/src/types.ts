export interface Message {
  id: string;
  site: string;
  name: string;
  email: string;
  message: string;
  ip: string | null;
  read: boolean;
  createdAt: string;
}

export interface MessagesResponse {
  items: Message[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SiteStats {
  site: string;
  total: number;
  unread: number;
}
