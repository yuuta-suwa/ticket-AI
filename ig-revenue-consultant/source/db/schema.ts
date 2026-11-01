import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("revenue_workspaces", {
  ownerId: text("owner_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const connections = sqliteTable("revenue_connections", {
  ownerId: text("owner_id").notNull(),
  provider: text("provider").notNull(),
  encrypted: text("encrypted").notNull(),
  metadata: text("metadata").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.provider] })]);
export const aiUsage = sqliteTable("revenue_ai_usage", {
  ownerId: text("owner_id").notNull(),
  day: text("day").notNull(),
  calls: integer("calls").notNull().default(0),
  tokens: integer("tokens").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.ownerId, t.day] })]);
export const auditLog = sqliteTable("revenue_audit_log", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
});
export const externalOperations=sqliteTable("revenue_external_operations",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),contentId:text("content_id").notNull(),
 status:text("status").notNull(),containerId:text("container_id"),mediaId:text("media_id"),
 message:text("message").notNull().default(""),createdAt:text("created_at").notNull(),
});

export const revenueAIJobs = sqliteTable("revenue_ai_jobs", {
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),status:text("status").notNull(),createdAt:text("created_at").notNull(),
});
