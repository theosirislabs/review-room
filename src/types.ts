export type PostFormat = "image" | "carousel" | "reel";

export type ClientStatus =
  | "Not Ready for Client"
  | "Needs Your Review"
  | "Approved"
  | "Changes Requested";

export type InternalStatus =
  | "Concept"
  | "Draft"
  | "Internal QA"
  | "Ready for Client"
  | "Changes Requested"
  | "Approved"
  | "Scheduled"
  | "Posted";

export interface Tenant {
  id: string;
  name: string;
  logoUrl: string;
  bio?: string;
  lastActive?: string;
  settings: {
    internalToken?: string;
    clientToken?: string;
    theme?: string;
  };
}

export interface Post {
  id: string;
  title: string;
  format: PostFormat;
  mediaUrls: string[];
  caption: string;
  hashtags: string[];
  date: string;
  time: string;

  // Client Side
  clientStatus: ClientStatus;
  clientComments: Comment[];

  // Internal Side
  internalStatus: InternalStatus;
  assignee: string;
  campaignCode: string;
  contentPillar: string;
  internalNotes: string;
  assetLineage: string;
  isBlocked: boolean;
  blockedReason?: string;
  thumbnailUrl?: string;
  internalTasks: Task[];

  // Workflow
  scheduledAt?: string;
  revisionCount?: number;
  publishedAt?: string;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  isInternalOnly: boolean;
  changeType?: string;
  priority?: "low" | "medium" | "high";
  slideIndex?: number;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  color: string;
  startDate: string;
  endDate: string;
  description?: string;
  createdAt?: string;
}

export interface ContentPillar {
  id: string;
  tenantId: string;
  name: string;
  color: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  createdAt?: string;
}

export interface ActivityEvent {
  id?: string;
  tenantId: string;
  action: string;
  subject: string;
  detail?: string;
  user?: string;
  timestamp: string;
}
