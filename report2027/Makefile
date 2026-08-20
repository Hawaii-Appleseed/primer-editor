CHROME := /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
PROFILE := $(shell mktemp -d /tmp/primer-pdf.XXXXXX)

all: data html pdf embed

validate:
	python3 tools/build_data.py --validate
	cd .. && python3 docsync/test_docsync.py
	python3 tools/test_render.py

# The draft editor runs this report's own renderer in the browser. docsync
# stages it — and everything it reads — next to the published page, driven by
# the editor: block in docsync.yml. Nothing about the editor is primer-specific,
# so there is nothing to configure here.
# No --repo: the bundled Budget Primer here is this repo's TEST FIXTURE, not
# the live report (that lives in its own repo and stages its own copy). Naming
# a report repo here baked it into the committed manifest, so anyone who
# cloned got an editor whose Save/Push aimed at someone else's repo. Left
# unset, docsync.stage defaults to this checkout's own origin.
editor: render
	cd .. && python3 -m docsync.stage --id budget-primer

# Publish the built report + editor into docs/, which GitHub Pages serves. This
# is the ONE build command — the local live server, the save endpoint, and CI
# all run it, so the deployed page is always exactly what a build here produces.
pub: editor
	cp web/index.html ../docs/primer/
	cp web/primer.css ../docs/primer/
# primer.js too: render_report.py emits <script src="primer.js"> into every
# built page, so leaving it out of this list meant the served report kept
# whatever copy happened to be in docs/ — every change to the interactive
# layer (footnote popovers, hover tooltips) silently never shipped.
	cp web/primer.js ../docs/primer/
	mkdir -p ../docs/primer/assets && cp -R web/assets/. ../docs/primer/assets/

data:
	python3 tools/build_data.py

# Rendering and rebuilding the data are different jobs. build_data.py parses
# source PDFs and needs PyMuPDF; the numbers it produces are committed and do
# not change because someone edited a sentence. Keeping `render` free of it lets
# CI regenerate the report from an edit without installing a PDF toolchain to
# recompute figures that did not move.
render:
	python3 tools/render_report.py

html: data render

pdf: html
	@mkdir -p dist
	"$(CHROME)" --headless=new --disable-gpu --no-sandbox --no-first-run \
	  --user-data-dir=$(PROFILE) --virtual-time-budget=12000 \
	  --no-pdf-header-footer \
	  --print-to-pdf="$(CURDIR)/dist/Budget-Primer-FY2026-27.pdf" \
	  "file://$(CURDIR)/web/index.html"
	rm -rf $(PROFILE)

# The report as plain text, for everyone downstream of the finished page: a
# colleague cutting social copy, a reviewer checking a figure, anyone pasting a
# passage into an email. Copying out of the PDF is not the same thing — chart
# values live in SVG geometry, so they come out of a text layer as a scattered
# pile of numbers with no labels attached. docsync.text walks the DOM instead
# and writes them as label/value pairs.
#
# Nothing here is primer-specific: the module keys off document structure and
# walks docsync.yml, so `python3 -m docsync.text` with no arguments writes a
# text version of EVERY project in the registry, and --id does one. This target
# is just the convenient spelling for the report that has a Makefile.
text: render
	cd .. && python3 -m docsync.text --id budget-primer

embed: html
	python3 tools/bundle_embed.py $(ASSET_BASE)

preview: html
	open web/index.html

# The local live-editing loop: serve docs/, rebuild on every change to the
# source (yours or Claude's), reload the browser in about a second, and push to
# the cloud when you press Save. See tools/serve.py.
live: setup
	python3 tools/serve.py

# One-time (and idempotent) local setup. `live` depends on it so a fresh clone
# cannot start the server missing a dependency or with the vendoring hook
# unarmed — both used to be manual steps documented elsewhere, and skipping
# either failed later and somewhere else.
setup:
	@cd .. && python3 tools/preflight.py

.PHONY: render editor pub live setup all validate data html pdf text embed preview
