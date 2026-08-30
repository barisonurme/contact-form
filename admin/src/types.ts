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

export type PageviewGroupBy = 'path' | 'country' | 'referrer' | 'day';

export interface PageviewGroupRow {
  key: string;
  views: number;
  uniques: number;
}

export interface PageviewStats {
  site: string;
  from: string;
  to: string;
  totalViews: number;
  uniqueVisitors: number;
  groupBy: PageviewGroupBy | null;
  breakdown: PageviewGroupRow[] | null;
}
