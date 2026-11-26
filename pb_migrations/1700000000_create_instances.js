/// <reference path="../pb_data/types.d.ts" />

/**
 * LEASE — PocketBase migration
 * Creates the `instances` collection that stores infrastructure
 * provisioning requests. The `users` collection is built-in and
 * handles authentication out of the box.
 *
 * Run with the pocketbase CLI:
 *   pocketbase migrate up
 */
migrate(
  (app) => {
    const collection = new Collection({
      name: "instances",
      type: "base",
      listRule:
        'creator_email = @request.auth.email || @request.auth.user_type.type = "admin"',
      viewRule:
        'creator_email = @request.auth.email || @request.auth.user_type.type = "admin"',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.user_type.type = "admin"',
      deleteRule: '@request.auth.user_type.type = "admin"',
      fields: [
        { name: "creator_email", type: "email", required: true },
        {
          name: "passion_group",
          type: "text",
          required: true,
          options: { min: 1, max: 120 },
        },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["vm", "container"],
        },
        {
          name: "hostname",
          type: "text",
          required: true,
          options: { min: 1, max: 64, pattern: "^[a-z0-9-]+$" },
        },
        {
          name: "os_template",
          type: "text",
          required: true,
          options: { min: 1, max: 120 },
        },
        { name: "specs", type: "json", required: true },
        {
          name: "network_type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["local", "public"],
        },
        {
          name: "dns_name",
          type: "text",
          required: false,
          options: { max: 253 },
        },
        { name: "ports", type: "text", required: false, options: { max: 512 } },
        {
          name: "purpose_notes",
          type: "text",
          required: true,
          options: { max: 4096 },
        },
        { name: "start_date", type: "date", required: true },
        { name: "end_date", type: "date", required: true },
        {
          name: "quantity",
          type: "number",
          required: true,
          options: { min: 1, max: 64, noDecimal: true },
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "completed"],
        },
        {
          name: "admin_reply",
          type: "text",
          required: false,
          options: { max: 4096 },
        },
        { name: "admin_reply_at", type: "date", required: false },
      ],
      indexes: [
        "CREATE INDEX idx_creator_email ON instances (creator_email)",
        "CREATE INDEX idx_status ON instances (status)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    // Rollback
    const collection = app.findCollectionByNameOrId("instances");
    app.delete(collection);
  },
);
