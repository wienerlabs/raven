import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { Pitch } from '@/lib/pitch/schema'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export type ReviewStatus = 'pending' | 'approved' | 'hold' | 'excluded'
export type Stage = 'new' | 'queued' | 'contacted' | 'engaged' | 'replied' | 'meeting' | 'declined' | 'unsubscribed' | 'bounced'
export type Relationship = 'prospect' | 'customer'
export type Channel = 'email' | 'whatsapp'
export type MessageStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'manual'
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed'
export type Intent = 'meeting' | 'info' | 'later' | 'not_interested' | 'other'
export type ResponseChannel = 'email' | 'whatsapp' | 'telegram' | 'landing'

export interface CampaignConfig {
  timezone: string
  windowStartHour: number
  windowEndHour: number
  weekdays: number[]
  minGapSeconds: number
  maxGapSeconds: number
  dailyLimitPerSender: number
  followUpDays: number[]
  followUpsEnabled: boolean
  subjectTest: boolean
  bounceGuardMinSent: number
  bounceGuardMaxRate: number
}

export const imports = pgTable('imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: text('filename').notNull(),
  rowCount: integer('row_count').notNull().default(0),
  created: integer('created').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  createdAt: createdAt(),
})

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull().default(''),
    title: text('title'),
    company: text('company').notNull(),
    companyForEmails: text('company_for_emails'),
    email: text('email'),
    emailStatus: text('email_status'),
    phone: text('phone'),
    whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
    domain: text('domain'),
    language: text('language').$type<'tr' | 'en'>().notNull().default('tr'),
    relationship: text('relationship').$type<Relationship>().notNull().default('prospect'),
    reviewStatus: text('review_status').$type<ReviewStatus>().notNull().default('pending'),
    stage: text('stage').$type<Stage>().notNull().default('new'),
    holdReason: text('hold_reason'),
    notes: text('notes'),
    flags: jsonb('flags').$type<string[]>().notNull().default([]),
    importId: uuid('import_id'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('contacts_slug_unique').on(table.slug),
    uniqueIndex('contacts_email_unique').on(table.email),
    uniqueIndex('contacts_phone_unique').on(table.phone),
    index('contacts_review_idx').on(table.reviewStatus),
    index('contacts_stage_idx').on(table.stage),
    index('contacts_domain_idx').on(table.domain),
  ],
)

export const domains = pgTable('domains', {
  domain: text('domain').primaryKey(),
  url: text('url'),
  title: text('title'),
  description: text('description'),
  excerpt: text('excerpt'),
  mxHosts: jsonb('mx_hosts').$type<string[]>().notNull().default([]),
  mxOk: boolean('mx_ok'),
  error: text('error'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
})

export const pitches = pgTable(
  'pitches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    content: jsonb('content').$type<Pitch>().notNull(),
    source: text('source').$type<'ai' | 'import' | 'manual'>().notNull(),
    model: text('model'),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('pitches_contact_unique').on(table.contactId)],
)

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: text('status').$type<CampaignStatus>().notNull().default('draft'),
  config: jsonb('config').$type<CampaignConfig>().notNull(),
  pauseReason: text('pause_reason'),
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channel: text('channel').$type<Channel>().notNull(),
    step: integer('step').notNull().default(0),
    variant: text('variant').$type<'a' | 'b'>().notNull().default('a'),
    senderId: text('sender_id'),
    status: text('status').$type<MessageStatus>().notNull().default('scheduled'),
    isTest: boolean('is_test').notNull().default(false),
    testRecipient: text('test_recipient'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    subject: text('subject'),
    rfcMessageId: text('rfc_message_id'),
    providerId: text('provider_id'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('messages_token_unique').on(table.token),
    uniqueIndex('messages_campaign_step_unique')
      .on(table.campaignId, table.contactId, table.step, table.channel)
      .where(sql`${table.isTest} = false and ${table.status} <> 'cancelled'`),
    index('messages_due_idx').on(table.status, table.scheduledAt),
    index('messages_contact_idx').on(table.contactId),
    index('messages_campaign_idx').on(table.campaignId),
    index('messages_rfc_idx').on(table.rfcMessageId),
    index('messages_provider_idx').on(table.providerId),
  ],
)

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index('events_contact_idx').on(table.contactId, table.createdAt),
    index('events_type_idx').on(table.type, table.createdAt),
    uniqueIndex('events_wa_inbound_unique')
      .on(sql`(${table.data}->>'id')`)
      .where(sql`${table.type} = 'wa_inbound'`),
    uniqueIndex('events_tg_inbound_unique')
      .on(sql`(${table.data}->>'id')`)
      .where(sql`${table.type} = 'tg_inbound'`),
  ],
)

export const responses = pgTable(
  'responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    channel: text('channel').$type<ResponseChannel>().notNull(),
    kind: text('kind').$type<'intent' | 'form' | 'reply' | 'auto_reply'>().notNull(),
    intent: text('intent').$type<Intent>().notNull().default('other'),
    body: text('body'),
    fromAddress: text('from_address'),
    handled: boolean('handled').notNull().default(false),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('responses_created_idx').on(table.createdAt), index('responses_contact_idx').on(table.contactId)],
)

export const suppressions = pgTable('suppressions', {
  value: text('value').primaryKey(),
  kind: text('kind').$type<'email' | 'phone' | 'domain' | 'telegram'>().notNull(),
  reason: text('reason').notNull(),
  createdAt: createdAt(),
})

export const telegramChats = pgTable(
  'telegram_chats',
  {
    chatId: text('chat_id').primaryKey(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    username: text('username'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    languageCode: text('language_code'),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [index('telegram_chats_contact_idx').on(table.contactId)],
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: updatedAt(),
})

export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
})

export const locks = pgTable('locks', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
})

export const passkeys = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: jsonb('transports').$type<string[]>().notNull().default([]),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    label: text('label').notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [index('passkeys_member_idx').on(table.memberId)],
)

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    name: text('name').notNull(),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('invites_token_unique').on(table.tokenHash)],
)

export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose').$type<'register' | 'login'>().notNull(),
    challenge: text('challenge').notNull(),
    memberId: uuid('member_id'),
    inviteId: uuid('invite_id'),
    name: text('name'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('auth_challenges_expiry_idx').on(table.expiresAt)],
)

