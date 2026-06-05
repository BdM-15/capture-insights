# Future "Skills" Ideas (Later Feature, Not MVP)

User note: With the advent of Skills open standard (and things like huashu-design style skills for visuals/presentations), we want to think about what post-processing skills make sense on top of the core capture-insights engine.

This is explicitly **not for v1**. We are focusing on getting reliable data → filters → dashboard → basic grounded chat → basic professional DOCX profile first.

## Core Principle
The "brain" (capture-insights) should produce clean, citable, structured insights + data.

Skills then take those insights and turn them into beautiful, specific deliverables (slides, full proposal sections, IGCEs, org charts, etc.).

This separation keeps the core simple and high-quality.

## High-Value Skill Ideas (in rough priority order for govcon work)

1. **Insight-to-Visuals / Presentation Skill** (the one you mentioned - like huashu-design)
   - Input: A set of filters + key insights from a dashboard or profile.
   - Output: Professional slide deck (PPTX) or clean one-pager with charts, tables, executive bullets, citations.
   - Why powerful: BD people hate making slides. Executives love seeing the story in 6-8 beautiful slides.

2. **Full Capture Profile Skill (v2 of the DOCX generator)**
   - Takes the structured data + stance + competitor intel + live SAM data.
   - Produces the complete 9-section (or expanded) professional document.
   - Can have different "flavors": Exec briefing version, Proposal kickoff version, Teaming partner version.

3. **Teaming Partner Recommender + Rationale Skill**
   - Given an opportunity + your stance, finds complementary past performers (from subaward + prime data).
   - Outputs ranked list + "why this partner makes sense" narrative with specific past contract examples.

4. **PWin / Bid-No-Bid Qualifier Skill**
   - Multi-factor scoring (historical win rate in this NAICS/agency, competition intensity, your capability overlap, incumbent strength, timing, etc.).
   - Outputs scored recommendation + the 3-5 biggest risks and mitigations.

5. **IGCE / Price-to-Win Builder Skill** (pairs beautifully with the federal-contracting-mcps)
   - Pulls BLS wages (via bls-oews-mcp), GSA CALC+ rates, historical pricing from similar awards.
   - Builds rough order of magnitude or more detailed independent cost estimate.
   - Can produce FFP, T&M, or Cost-reimbursement flavored versions.

6. **SOW / PWS Language Generator Skill**
   - Takes the requirement (from SAM solicitation via mcp) + your stance + past performance language.
   - Drafts compliant, winning-flavored performance work statement language.

7. **Knowledge Base / "What We Learned" Updater Skill**
   - After a pursuit (win or loss), user feeds back key lessons.
   - Skill updates your stance, adds new win themes to the library, flags capability gaps.
   - This is how the system compounds knowledge over years.

8. **Competitor Ghosting / Vulnerability Analysis Skill**
   - Deep dive on one or two key competitors.
   - Pulls their recent awards, modification patterns, subcontractor reliance, geographic weaknesses, etc.
   - Outputs "how to position against them" talking points.

9. **Pipeline / CRM Sync Skill**
   - Exports selected opportunities + scores + next actions into Salesforce, HubSpot, or even a simple local CSV/Excel that your BD team already uses.

10. **"Weekly Market Brief" Skill**
    - Runs on a schedule (or on demand).
    - Produces a short email or one-pager: "What moved in 561210 and adjacent NAICS this week" + new SAM opps + expiring contracts + any interesting policy news from Federal Register mcp.

## How Skills Would Actually Work (High Level)
- capture-insights exposes clean, typed "insight packages" (JSON with data + citations + provenance).
- A Skill (could be another Python script, a Claude/Cursor skill, a separate MCP server, or even a small Tauri/electron tool) consumes that package + user instructions.
- Output goes to the right format (PPTX via python-pptx, DOCX, Markdown for Obsidian/Notion, etc.).
- Because the core is solid, skills can be written by different people or even generated/improved over time.

## For Right Now (MVP)
We will make sure the core produces high-quality structured + citable output so that when we (or you) are ready to build these skills, the foundation is excellent.

The training data we collect while using the core system will also be extremely valuable for making these skills smarter (or for fine-tuning a model that powers several skills).

---

Document started June 2026. We will add more ideas and concrete interface thoughts when the core is stable enough that "what good input looks like" is clear.
