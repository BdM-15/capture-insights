"""
Super simple exploration script.

Run with:
uv run python scripts/explore_demo.py

This shows you (in plain language) that your data is now queryable with normal SQL.
"""

import duckdb

con = duckdb.connect("data/capture.duckdb")

print("=== 1. How much money and how many actions per NAICS? ===")
df = con.execute("""
    SELECT 
        naics_code,
        COUNT(*) as number_of_transactions,
        ROUND(SUM(federal_action_obligation) / 1_000_000.0, 2) as total_millions
    FROM usaspending_prime_awards 
    GROUP BY naics_code 
    ORDER BY total_millions DESC
""").df()
print(df)
print()

print("=== 2. For your main NAICS (561210), what does it look like by year? ===")
df2 = con.execute("""
    SELECT 
        fy as fiscal_year,
        COUNT(*) as actions,
        ROUND(SUM(federal_action_obligation) / 1_000_000.0, 2) as millions
    FROM usaspending_prime_awards 
    WHERE naics_code = '561210'
    GROUP BY fy 
    ORDER BY fy
""").df()
print(df2)
print()

print("=== 3. Simple filter example: big awards only ===")
df3 = con.execute("""
    SELECT recipient_name, federal_action_obligation, action_date
    FROM usaspending_prime_awards 
    WHERE federal_action_obligation > 2000000
    ORDER BY federal_action_obligation DESC
""").df()
print(df3)

print("\nSee? Just normal questions in English-like SQL against one file.")
print("The backend and future UI will run queries very much like these.")