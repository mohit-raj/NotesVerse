const express = require("express");
const { checkAuth } = require("./middleware/auth");
const { publicDir, uploadsDir } = require("./paths");

const authRoutes = require("./routes/auth.routes");
const treeRoutes = require("./routes/tree.routes");
const subjectsRoutes = require("./routes/subjects.routes");
const microthemesRoutes = require("./routes/microthemes.routes");
const sectionsRoutes = require("./routes/sections.routes");
const itemsRoutes = require("./routes/items.routes");
const peopleRoutes = require("./routes/people.routes");
const pyqsRoutes = require("./routes/pyqs.routes");
const aspectsRoutes = require("./routes/aspects.routes");
const quotesRoutes = require("./routes/quotes.routes");
const summaryRoutes = require("./routes/summary.routes");
const attachmentsRoutes = require("./routes/attachments.routes");
const notesRoutes = require("./routes/notes.routes");
const chatRoutes = require("./routes/chat.routes");
const pyqRoutes = require("./routes/pyq.routes");
const plannerRoutes = require("./routes/planner.routes");
const topicsRoutes = require("./routes/topics.routes");
const importRoutes = require("./routes/import.routes");
const themesRoutes = require("./routes/themes.routes");
const backupRoutes = require("./routes/backup.routes");

const app = express();
app.use(express.json({ limit: "40mb" }));

// Auth endpoints must stay reachable before the auth gate below —
// otherwise nobody could ever log in.
app.use("/api", authRoutes);

app.use(checkAuth);

app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadsDir));

app.use("/api", treeRoutes);
app.use("/api", subjectsRoutes);
app.use("/api", microthemesRoutes);
app.use("/api", sectionsRoutes);
app.use("/api", itemsRoutes);
app.use("/api", peopleRoutes);
app.use("/api", themesRoutes);
app.use("/api", backupRoutes);
app.use("/api", pyqsRoutes);
app.use("/api", aspectsRoutes);
app.use("/api", quotesRoutes);
app.use("/api", summaryRoutes);
app.use("/api", attachmentsRoutes);
app.use("/api", notesRoutes);
app.use("/api", chatRoutes);
app.use("/api", pyqRoutes);
app.use("/api", plannerRoutes);
app.use("/api", topicsRoutes);
app.use("/api", importRoutes);

module.exports = app;
