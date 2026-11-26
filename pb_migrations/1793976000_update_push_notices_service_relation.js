/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const notices = app.findCollectionByNameOrId("push_notices");
  const field = notices.fields.getByName("service");
  if (field && field.type === "relation") {
    // Already migrated
    return;
  }

  // Update existing data if any legacy string codes remain
  const mapping = {
    'PRINT': 'ytan4m3hbzj53zt',
    'INSTANCES': 'r2e4nkzzi6mae93',
    'BORROW': '3kzy4o7ckfcrsm9',
    'BOOKINGS': 'utmqt5k92gmsodh',
    'ANNOUNCEMENTS': 'ow2zg8jqdqai2t9'
  };

  const db = app.db();
  for (const [code, id] of Object.entries(mapping)) {
    db.newQuery("UPDATE push_notices SET service = {:id} WHERE service = {:code}")
      .bind({ id, code })
      .execute();
  }

  // Remove old text field and add relation field
  if (field) {
    notices.fields.removeById(field.id);
  }

  const services = app.findCollectionByNameOrId("services");
  notices.fields.add(new Field({
    "cascadeDelete": false,
    "collectionId": services.id,
    "help": "",
    "hidden": false,
    "id": "relation3785202386",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "service",
    "presentable": true,
    "required": true,
    "system": false,
    "type": "relation"
  }));

  return app.save(notices);
}, (app) => {
  const notices = app.findCollectionByNameOrId("push_notices");
  const field = notices.fields.getByName("service");
  if (field) {
    notices.fields.removeById(field.id);
  }
  notices.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text3785202386",
    "max": 16,
    "min": 0,
    "name": "service",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }));
  return app.save(notices);
});
