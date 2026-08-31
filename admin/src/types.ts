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

export type PageviewGroupBy =
  | 'path'
  | 'country'
  | 'region'
  | 'referrer'
  | 'day'
  | 'browser'
  | 'device';

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

export interface Visitor {
  hash: string;
  views: number;
  paths: number;
  country: string;
  region: string;
  device: string;
  browser: string;
  firstSeen: string;
  lastSeen: string;
}

export interface VisitorsResponse {
  site: string;
  day: string;
  stale: boolean;
  visitors: Visitor[];
}

export interface VisitorHit {
  path: string;
  referrer: string;
  country: string;
  region: string;
  device: string;
  browser: string;
  at: string;
}

export interface VisitorSession {
  site: string;
  day: string;
  hash: string;
  hits: VisitorHit[];
}
