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
that session lasts about a month.[^hub] The next page is about choosing a
Claude model, because that is the decision most of us make most often. The two
after it draw the hub itself: GitHub, where the code and the reports are kept,
and Cloudflare, which serves them and remembers what you do.
[[fig1.h]]
Figure 2. What Is In GitHub, And What Of It Is Public
[[fig1.note]]
Fifteen of the sixteen repositories are private. The public one is the
website's, and the two feeds GitHub Pages serves from it are what the hub's
Library is built out of — read straight, with no auth and no copy kept here.
Source: the README's "The Library" and "Making a document on the hub".[^readme]
[[cover.read.h]]
### What GitHub is for
[[cover.read.p]]
**GitHub is the filing cabinet that never forgets.** Nothing in it is
overwritten. A change is saved as a **commit** — a snapshot with a date, an
author and a sentence saying why — and a **repository** is one project's
folder plus every commit ever made to it. You edit on your own laptop and
then **push**, which sends your commits to the shared copy. That is the
point: any version can be brought back, and you can always see who changed
what.

**A report is one folder in a repository.** Its words, its layout and the
Python that draws it sit together in `primer-editor` — the folder the editor
opens — and Publish sends an edited report back as a commit of its own. A
push to the hub's own repository is what rebuilds the site, which is why a
new feature can appear without anyone sending you a link. **Almost none of it
is public.** One of the sixteen is: the website's, whose two feeds GitHub
Pages serves to anyone who asks, and the Library is built from them.
Everything carrying our own work — attendance, strategy, the notes — is
private, behind the gate.
[[cover.card.title]]
### Two things worth remembering

[[cover.card.bullets]]
- **Git seeds a document; the store keeps it.** The committed copy is what you see until the first Save. After that R2 is what staff read, and carrying a fresh copy across from GitHub will not change it.
- **Two speeds, on purpose.** Pages and code arrive by a push and a rebuild. Checkboxes, tasks, board cards and report edits are saved live, and are on everyone else's screen in seconds.
[[pcf.eyebrow]]
WHERE IT ALL RUNS

[[pcf.h1]]
What Cloudflare keeps

[[pcf.sub]]
The gate in front of everything, and the four places your work is kept.
[[pcf.foot]]
*Where it all runs*

[[fig2.h]]
Figure 3. Cloudflare — One Gate, And Four Stores Behind It
[[fig2.note]]
Nothing in this diagram touches GitHub: Pages is rebuilt by a push, but every
other arrow here is live. Source: the README's "Shared checkboxes", "The live
updates mirror", "The documents, on R2" and "The primer editor's rooms".[^readme]
[[cf.read.h]]
### What Cloudflare is for
[[cf.read.p]]
**Cloudflare serves the hub and remembers what you do.** Pages puts the pages
in front of you and rebuilds them whenever GitHub is pushed to; everything
under `/api` is a small program committed beside them. Behind those sit the
things that have to be live — **KV** for your checkboxes, the task board, the
comms board and the notes; **R2** for the documents in the editor and every
version of every one of them; and **the room**, where two people editing the
same report see each other type. One gate covers all of it: Access checks your
Google sign-in before anything is answered, including the call your own Claude
makes over MCP, which is why that needs no GitHub account.
[[peval.eyebrow]]
CHOOSING A MODEL

[[peval.h1]]
Three models, and what effort costs

[[peval.sub]]
Start with Opus 5. Turn the effort up for long coding work, and leave it alone
for everything else.

[[peval.foot]]
*Choosing a model*

[[figmodels.h]]
Figure 1. The Three Models, And What Raising The Effort Buys

[[figmodels.note]]
Every price here is an API list rate, per million tokens or per task. On a
claude.ai or Claude Code subscription nobody is billed that way, so read them
as ratios: which model, and which effort, costs several times another. The
SWE-bench Pro scores are a subset both models largely saturate and are not
comparable to the public leaderboard, and Opus 5's `medium` row is derived
from the source's "about 2 points at `medium` for half the cost" against its
91.7% / $1.01 default.[^models][^cost]
[[eval.read.h]]
### What to take from this

[[eval.read.p]]
**Start with Opus 5.** It is the one to reach for on most work, and on the
coding subset above it matched Fable 5.1 at the default — 91.7% against 92.1%,
inside run-to-run noise — for about 15% less per solved task. Go to **Fable
5.1** for demanding reasoning and long-horizon agentic work, or when Opus 5 at
a higher effort still falls short. Go to **Sonnet 5** when speed and volume
matter more than the last few points.

**Effort is not a dial to leave turned up.** On long coding work it buys real
accuracy: Opus 5 gives up about 8 points at `low` and about 2 at `medium`, for
a quarter and a half of the cost. On research and knowledge work the curve is
nearly flat — Fable 5.1 scored about the same at `low`, `medium` and `high`
while the cost per task went from $4.66 to $7.12. The default is `high` on all
three models, so the saving is in turning it **down** where it buys nothing.

[[cover.contents.h]]
### What is in here

[[p2.eyebrow]]
WHERE THE WORK IS KEPT
[[p2.h1]]
What GitHub remembers
[[p2.sub]]
Every change to the code and the reports is kept, with a name on it. Fifteen
of the sixteen repositories are private; the one that is not feeds the
Library.
[[p2.foot]]
*Where the work is kept*
[[cover.contents.02]]
Three models, and what effort costs
[[cover.contents.03]]
What is in GitHub, and what is public
[[cover.contents.04]]
What Cloudflare keeps
[[cover.contents.05]]
Updates
[[cover.contents.06]]
Calendar and Tasks
[[cover.contents.07]]
Library, Resources, and search
[[cover.contents.08]]
The report editor
[[cover.contents.09]]
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

[[fig3.h]]
Figure 4. How An Edit To The Notes Doc Reaches The Page
[[fig3.note]]
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
- **On claude.ai** (Pro, Max or Team): Settings, then Connectors, then Add custom connector, and give it the hub's `/api/mcp` address — on a Team plan an administrator can add it once for everyone.[^mcp]
- **In Claude Code**: `claude mcp add --transport http hub` followed by the same address.
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
Google account the browser used. A stuck session can serve a stale refusal
after the cause is fixed; sign out of Access and retry in a private window.
**If Updates looks stale**, give it a minute: there is a five-minute safety
net behind the instant path. **If a data file looks wrong, do not fix it by
hand** — everything under `data/` is generated and overwritten. Say something
instead.[^readme]
[[p7.foot]]
*Your own Claude* · *When something breaks*

[[pmcp.eyebrow]]
FOUR WORDS FOR NEARLY ONE THING

[[pmcp.h1]]
Connectors, the CLI, MCP servers and plugins

[[pmcp.sub]]
Three of these are the same machinery seen from different places. The fourth
is a bundle that can contain it.

[[pmcp.foot]]
*Connectors, the CLI, MCP servers and plugins*

[[figstack.h]]
Figure 5. What Each Of The Four Actually Is

[[figstack.note]]
Sources: Anthropic's own documentation on custom connectors, on MCP in Claude
Code, and on creating plugins.[^connectors][^ccmcp][^plugins]

[[stack.read.h]]
### Telling them apart

[[stack.read.p]]
**The MCP server is the thing itself** — one address speaking one protocol.
This hub is one, at `/api/mcp`, and everything below is a way of reaching it.

**A connector and `claude mcp add` are two doors onto that same server.** On
claude.ai you add a connector under Settings; in Claude Code you run `claude
mcp add --transport http`. Same server, same address, different app — and if
you signed in to Claude Code with your claude.ai account, the connectors you
added there are already available. Anthropic verifies the pre-built
connectors, Google Workspace and the like; a **custom** connector is any
remote MCP server that has not been through that, which is what this hub is.

**A plugin is not a door.** It is a bundle, it is Claude Code only, and it is
installed from a marketplace: skills, agents, hooks, commands, LSP servers,
background monitors — and, if it wants one, an `.mcp.json`. That last part is
an MCP server, which is the whole reason these four words get muddled. The
useful test: if you are trying to reach one service, you want a connector or
`claude mcp add`. If you are trying to hand somebody a working setup, you want
a plugin.

[[cover.contents.10]]
Connectors, the CLI, MCP servers and plugins

[[pend.foot]]
*Where this is written down*

[[foot.running]]
THE TOOLKIT

[[endnotes.h2]]
Where this is written down

[[sources]]
[hub]: The staff hub — https://staff-updates-internal.pages.dev
[readme]: The hub's README — https://github.com/Hawaii-Appleseed/staff-updates-internal/blob/main/README.md
[primer-editor]: primer-editor, the report engine — https://github.com/Hawaii-Appleseed/primer-editor
[legis]: Legislative-Research-Tool — https://github.com/Hawaii-Appleseed/Legislative-Research-Tool
[models]: Anthropic, Models overview — https://platform.claude.com/docs/en/models/overview
[cost]: Anthropic, Optimizing for cost and intelligence — https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence
[connectors]: Anthropic, About custom connectors — https://support.claude.com/en/articles/11175166-about-custom-connectors-remote-mcp
[ccmcp]: Anthropic, MCP in Claude Code — https://code.claude.com/docs/en/mcp
[plugins]: Anthropic, Create plugins — https://code.claude.com/docs/en/plugins
[mcp]: "Ask your own Claude", in the README — https://github.com/Hawaii-Appleseed/staff-updates-internal/blob/main/README.md
