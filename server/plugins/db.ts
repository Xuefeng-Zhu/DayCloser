import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "dc_photographers",
      sql: `CREATE TABLE IF NOT EXISTS dc_photographers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialty TEXT NOT NULL DEFAULT '',
        service_ids TEXT NOT NULL DEFAULT '[]',
        color TEXT NOT NULL DEFAULT 'blue'
      )`,
    },
    {
      version: 2,
      name: "dc_services",
      sql: `CREATE TABLE IF NOT EXISTS dc_services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        duration_min INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        deposit_cents INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT ''
      )`,
    },
    {
      version: 3,
      name: "dc_contacts",
      sql: `CREATE TABLE IF NOT EXISTS dc_contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        opted_in INTEGER NOT NULL DEFAULT 0,
        preferred_service_id TEXT NOT NULL DEFAULT '',
        preferred_photographer_id TEXT NOT NULL DEFAULT '',
        preferred_days TEXT NOT NULL DEFAULT '[]',
        preferred_times TEXT NOT NULL DEFAULT '[]',
        last_session_at TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT ''
      )`,
    },
    {
      version: 4,
      name: "dc_bookings",
      sql: `CREATE TABLE IF NOT EXISTS dc_bookings (
        id TEXT PRIMARY KEY,
        photographer_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        contact_id TEXT NOT NULL DEFAULT '',
        customer_name TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'confirmed',
        source TEXT NOT NULL DEFAULT 'existing',
        offer_id TEXT NOT NULL DEFAULT '',
        hold_expires_at TEXT NOT NULL DEFAULT '',
        cancelled_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    },
    {
      version: 5,
      name: "dc_campaigns",
      sql: `CREATE TABLE IF NOT EXISTS dc_campaigns (
        id TEXT PRIMARY KEY,
        photographer_id TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        origin TEXT NOT NULL,
        cancelled_booking_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'selecting',
        won_contact_id TEXT NOT NULL DEFAULT '',
        booking_id TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        owner_email TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    },
    {
      version: 6,
      name: "dc_invitations",
      sql: `CREATE TABLE IF NOT EXISTS dc_invitations (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        token TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'invited',
        reason TEXT NOT NULL DEFAULT '',
        needs_agent INTEGER NOT NULL DEFAULT 0,
        last_reply_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    },
    {
      version: 7,
      name: "dc_messages",
      sql: `CREATE TABLE IF NOT EXISTS dc_messages (
        id TEXT PRIMARY KEY,
        invitation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        body TEXT NOT NULL,
        offer_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
    },
    {
      version: 8,
      name: "dc_offers",
      sql: `CREATE TABLE IF NOT EXISTS dc_offers (
        id TEXT PRIMARY KEY,
        invitation_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        photographer_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        deposit_cents INTEGER NOT NULL,
        rationale TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'proposed',
        paypal_order_id TEXT NOT NULL DEFAULT '',
        paypal_capture_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    },
    {
      version: 9,
      name: "dc_activity",
      sql: `CREATE TABLE IF NOT EXISTS dc_activity (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    },
  ],
  { table: "daycloser_migrations" },
);
