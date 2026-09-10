<!--
  The Toolkit — the internal guide to the staff hub's tools.

  Not a research report: no org boilerplate, no copyright page, no author
  line. It is documentation of our own tools, so the endnotes point at where
  each thing is actually written down rather than at outside sources.

  Every heading and every paragraph here is a [[slot]] and editable in the
  draft editor. The two diagrams are drawn by render_report.py through
  graphic(), so they can be moved and resized but their contents are code —
  changing what a diagram SAYS is a change to render_report.py.
-->

[[title]]
The Toolkit

[[cover.eyebrow]]
HAWAIʻI APPLESEED · STAFF HUB

[[cover.h1]]
# The Toolkit

[[cover.deck]]
Every tool on the staff hub — what each one is for, how to use it, and why a
single Google sign-in covers all of them.

[[cover.stamp]]
September 2026 · Internal

[[cover.lead]]
THE STAFF HUB IS ONE WEBSITE with five tabs, and everything in this guide
lives on it. There is nothing to install, no second password, and no separate
account: you reach it at **staff-updates-internal.pages.dev**, sign in with
your Hawaiʻi Appleseed or Hawaiʻi Budget and Policy Center Google account, and
that session lasts about a month.[^hub] The diagram on the next page is the
whole system on one page, Claude included. It is worth two minutes before the
tool-by-tool part, because almost every question anyone asks about the hub —
why did this change appear on its own, why can I edit this, why has the
repository not got my edit in it — is answered by which door the change came
through.

[[fig1.h]]
Figure 1. How Claude, GitHub And Cloudflare Divide The Work

[[fig1.note]]
The barred arrow is the whole point: nothing on the Cloudflare side flows back
to GitHub. Git seeds a document once, and the store keeps it from then on.
Source: the README's "The documents, on R2" and "Ask your own Claude" — no
GitHub token is involved on that path at all.[^readme]

[[cover.read.h]]
### Which door a change came through

[[cover.read.p]]
**Claude Code works the way anyone with a checkout works.** It edits real
files on a laptop, commits them, and pushes. A push to the hub's own
repository is what makes Cloudflare rebuild the site, which is why a new
feature can appear without anyone sending you a link. A push to
`primer-editor` publishes nothing by itself: the report engine has to be
carried across into the hub's repository first, and that second commit is the
one that deploys.

**Your own Claude does none of that.** It signs in through Access the way a
browser does and edits the reports directly — no GitHub account, no token, no
commit anywhere. It writes into the room when somebody has the document open,
and into the document store when nobody does. The shared state that is not a
report — your checkboxes, the task board, the comms board — is kept live at
Cloudflare in the same way, so none of it waits on a rebuild either.

[[cover.card.title]]
### Two things worth remembering

[[cover.card.bullets]]
- **Git seeds a document; the store keeps it.** The committed copy is what you see until the first Save. After that the store is what staff read, and carrying a fresh copy across will not change it.
- **Nothing flows back to GitHub.** A report edited on the hub drifts away from its repository, so treat the hub copy as the draft and not as the published one.
- **One gate covers both doors.** Access checks your Google sign-in before any page or any `/api` call is answered, which is why nothing here has its own login and why a link pasted into Slack is safe to paste.

[[cover.contents.h]]
### What is in here

[[p2.eyebrow]]
HOW THE WORK GETS IN

[[p2.h1]]
Two doors, and only one goes through GitHub

[[p2.sub]]
Claude Code commits and pushes. Your own Claude edits the hub directly. Which
door a change came through is what tells you where it now lives.

[[p2.foot]]
*How the work gets in*

[[cover.contents.02]]
Two doors, and only one is git

[[cover.contents.03]]
Updates

[[cover.contents.04]]
Calendar and Tasks

[[cover.contents.05]]
Library, Resources, and search

[[cover.contents.06]]
The report editor

[[cover.contents.07]]
Your own Claude, and what to do when something breaks

[[p3.eyebrow]]
THE FIRST TAB

[[p3.h1]]
Updates

[[p3.sub]]
The all-staff meeting, turned into something you can search and check off —
without anyone copying anything across.

[[updates.p]]
UPDATES IS THE FIRST TAB and it is the all-staff notes doc, rearranged by
topic. Nobody copies anything across. You edit the notes doc as you always
have; the hub notices within about a minute and re-renders itself. Bullets are
grouped into cards by team, and a heading the parser has not seen before is
never dropped — it publishes as its own card in amber, with a note, so drift
in the notes doc shows up on the page instead of quietly losing content.

[[fig2.h]]
Figure 2. How An Edit To The Notes Doc Reaches The Page

[[fig2.note]]
Source: the README's "live updates mirror" and "Why syncNow takes a lock". The
committed copy reaches the page on the next rebuild; the live mirror reaches it
in seconds, which is why you rarely wait.[^readme]

[[updates.how.h]]
### What to do on this page

[[updates.how.p]]
**Check off a bullet** and it is checked off for everyone — the box is shared
state, not a note to yourself, so use it to mean the thing is done rather than
to mark your own place. **Open Coming up** to see what is dated in the next
couple of weeks without leaving the page. **Press Command-K** (Control-K on
Windows) anywhere on the hub for the search palette, which searches meeting
bullets, resources, certificates, media, published work, testimony and
positions at the same time. If a bullet is worth acting on beyond the meeting,
put it on the board rather than leaving it in the notes.

[[p4.eyebrow]]
DATES AND WHO IS DOING WHAT

[[p4.h1]]
Calendar and Tasks

[[p4.sub]]
One board, four views, and the dated bullets from the notes arriving on it
without anyone entering them twice.

[[p4.foot]]
*Calendar and Tasks* · *Subscriptions*

[[cal.h]]
### One page, four views

[[cal.p]]
The Calendar tab is one page in four views. **Board** is To do, In progress and
Done; **Week**, **Month** and **List** are the same cards by due date, and every
dated or timed bullet from the notes appears there on its own, with no one
entering it twice. Underneath the board is the **Publishing pipeline** — report
rollouts and blog posts, live, so a date moving there does not need a rebuild.
Drag a card between columns or across days and it moves for everyone.

[[cal.card.title]]
### Getting the board into your own calendar

[[cal.card.bullets]]
- Open a task and use **Add to my Google** — it copies into your own Google Calendar or Google Tasks and stays in step, both directions.
- It is not instant. A change on the board reaches your Google copy on the next tick, up to fifteen minutes later.
- The **Subscribe** button hands you a feed URL for the whole board or just your own tasks, for anything that reads calendar subscriptions.

[[p3.foot]]
*Updates*

[[p5.eyebrow]]
FINDING THINGS

[[p5.h1]]
Library, Resources, and search

[[p5.sub]]
Everything we have published, everything we have filed, and the one search box
that covers both.

[[lib.p]]
LIBRARY IS EVERYTHING WE HAVE PUBLISHED and everything we have filed, in one
list — the live site feeds plus the research corpus. It replaced two separate
tabs that carried the same reports and blog posts at different depths, which
meant guessing which one to open. Filter pills narrow the list and always carry
their count; jump pills move you down the page. If you are looking for a
specific publication, start here.

[[res.h]]
### Resources

[[res.p]]
Resources is the Drive side: staff documents, the most-linked files, and the
**Brand and media** band — the brand kit, event media and the blog pipeline.
The old Media tab redirects here, anchors and search terms intact. Thumbnails
for the brand kit are fetched only when you open that fold, so the page stays
quick.

[[search.h]]
### Two different searches, and when to use which

[[search.p]]
**Command-K** is the fast one: it matches titles and text across every source
on the hub at once and is the right reflex when you half-remember something.
**Content search** is the careful one — a hybrid of keyword, meaning and a
reranking pass over testimony, blog posts and publications, with a browsable
library and positions directory when you type nothing. Use Command-K to find a
document you know exists; use content search when you need every place we have
said something about a subject.

[[search.card.title]]
### Also on the hub, off the nav

[[search.card.bullets]]
- **The voting record** — per-legislator Hawaiʻi tax votes, 2022 to 2026, built from the Legislative Research Tool.[^legis] Deliberately not in the nav; it is reachable by its link, and Access gates it like every other page.
- **The certificate and positions data** behind the search palette, which is why a Command-K result can be something no tab shows you directly.

[[p5.foot]]
*Library* · *Resources* · *Search*

[[p6.eyebrow]]
WRITING AND DESIGNING

[[p6.h1]]
The report editor

[[p6.sub]]
Reports, briefs and one-pagers, edited in the browser, by more than one person
at a time.

[[ed.p]]
THE EDITOR TAB IS A REPORT EDITOR, and the documents in it are real designed
sheets rather than flowing pages: 8.5 by 11 inches, with a text column, a
figure that can be dragged, and a page count. You edit the words in place, and
you move things by selecting them. It runs on this hub rather than somewhere
else specifically so that it inherits your Google sign-in — the editor's own
authentication is GitHub, and most of the people who need to use it have no
GitHub account.[^readme] The engine itself, and the repository a brand-new
report gets built in, is primer-editor.[^primer-editor]

[[ed.card.title]]
### The five things to know

[[ed.card.bullets]]
- **New document asks what to start from**, because a report is its renderer as much as its text. The copy borrows the engine of whatever you pick.
- **Save is a version, and every version is kept.** If a document moved underneath you, the save is refused rather than overwriting someone.
- **Command-G groups, Command-Shift-G ungroups.** A card's title and bullets move as one until you pull them apart.
- **A folder is only a label.** Filing a document does not move it and deleting a folder does not take its documents with it.
- **Take off the list is reversible; Delete for good is not.** The Removed shelf at the foot of the page puts anything back.

[[ed.rooms.h]]
### Editing at the same time as someone else

[[ed.rooms.p]]
Every document has a room, and everyone in it types into the same copy — the
way a Google Doc works, cursors and all. The hub shows you who is in a
document before you open it. There is no lock and no check-out, so the honest
advice is to look at who else is in there before you rearrange pages.

[[ed.share.h]]
### Who can open what

[[ed.share.p]]
**A document nobody has narrowed is editable by everyone who gets through
Access**, and that is deliberate: the share record exists to restrict a
document, never to be the thing that grants access in the first place. Anyone
who can edit can also re-share. Sharing outside the two staff domains is not
something the dialog can do — a partner organization or a consultant needs a
Cloudflare change, so ask rather than assuming it will cover it.

[[p6.foot]]
*The report editor*

[[p7.eyebrow]]
THE REST

[[p7.h1]]
Your own Claude, and what to do when something breaks

[[p7.sub]]
The thing here that saves the most time, and what to check before reporting
something as broken.

[[mcp.p]]
THE HUB IS AN MCP SERVER, which means your own Claude can read and edit the
reports in the editor as you. Nothing gets installed and the hub holds no
model key — the subscription you already have does the thinking. It is the
fastest way to draft into a report: ask for a section and watch it land, with
everyone else in the room watching too.

[[mcp.card.title]]
### Adding it

[[mcp.card.bullets]]
- **On claude.ai** (Pro, Max or Team): Settings, then Connectors, then Add custom connector, and give it the hub's `/api/mcp` address.[^mcp]
- **In Claude Code**: `claude mcp add --transport http hub` followed by the same address.
- **On a Team plan** an administrator can add it once for everyone.
- You will be sent through the ordinary Google sign-in, and everything Claude then does is done as you — it can only reach the documents you can.

[[subs.h]]
### Calendar subscriptions

[[subs.p]]
The hub can hand out two subscribable calendars — every dated bullet from the
notes, and the task board by due date, optionally just your own tasks. Both are
off unless switched on, each has its own token, and the Subscribe button only
lists the ones that are live. A subscription URL carries its token, so treat it
the way you would treat a private calendar link and do not post one in a public
channel.

[[broke.h]]
### When something looks wrong

[[broke.p]]
**If a page will not let you in**, the question is almost never permission —
everyone on either staff domain is allowed automatically — so check which
Google account the browser used first. A stuck session can serve a stale
refusal after the cause is fixed; signing out of Access and retrying in a
private window clears it. **If the Updates page looks stale**, give it a
minute — there is a five-minute safety net behind the instant path. **If a
data file looks wrong, do not fix it by hand**: the files under `data/` are
generated and overwritten. Say something instead, because the fix belongs in
the hub's README.[^readme]

[[p7.foot]]
*Your own Claude* · *When something breaks*

[[foot.running]]
THE TOOLKIT

[[endnotes.h2]]
Where this is written down

[[sources]]
[hub]: The staff hub — https://staff-updates-internal.pages.dev
[readme]: Staff Updates (internal) — the hub's README, where every section named in this guide is a heading — https://github.com/Hawaii-Appleseed/staff-updates-internal/blob/main/README.md
[primer-editor]: primer-editor — the report engine the Editor tab runs, and the repository new reports are built in — https://github.com/Hawaii-Appleseed/primer-editor
[legis]: Legislative-Research-Tool — the source of the voting record — https://github.com/Hawaii-Appleseed/Legislative-Research-Tool
[mcp]: Ask your own Claude — the README section covering the connector, the seven tools, and how an edit lands — https://github.com/Hawaii-Appleseed/staff-updates-internal/blob/main/README.md
