/* Seeds the Micro Plan with a starter list of subjects and topics the
   first time the app runs with the planner tables. It never runs again
   after that (a "seeded" flag is kept in plan_settings), so deleting
   every subject in the app does not bring the defaults back. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function seedPlanner(db) {
  const flag = db.prepare("SELECT value FROM plan_settings WHERE key='seeded'").get();
  if (flag) return;
  const hasRows = db.prepare("SELECT COUNT(*) n FROM plan_subjects").get().n > 0;

  const run = db.transaction(() => {
    if (!hasRows) {
      const file = path.join(__dirname, "planner-seed.json");
      if (fs.existsSync(file)) {
        const seed = JSON.parse(fs.readFileSync(file, "utf8"));
        const setKV = db.prepare("INSERT OR REPLACE INTO plan_settings (key,value) VALUES (?,?)");
        Object.entries(seed.settings || {}).forEach(([k, v]) => setKV.run(k, v));
        const insS = db.prepare("INSERT INTO plan_subjects (id,track,name,status,sort_order) VALUES (?,?,?,?,?)");
        const insT = db.prepare("INSERT INTO plan_topics (id,subject_id,name,sort_order) VALUES (?,?,?,?)");
        Object.entries(seed.tracks || {}).forEach(([track, subjects]) => {
          subjects.forEach((s, i) => {
            const sid = crypto.randomUUID();
            insS.run(sid, track, s.name, s.status || "todo", i);
            (s.topics || []).forEach((t, j) => insT.run(crypto.randomUUID(), sid, t, j));
          });
        });
      }
    }
    db.prepare("INSERT OR REPLACE INTO plan_settings (key,value) VALUES ('seeded','1')").run();
  });
  run();
}

module.exports = { seedPlanner };
