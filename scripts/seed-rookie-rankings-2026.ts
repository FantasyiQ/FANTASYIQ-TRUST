/**
 * Seed script — Dynasty Rookie Rankings 2026
 *
 * Run with:  npx tsx scripts/seed-rookie-rankings-2026.ts
 *
 * Idempotent: upserts on (season, playerName).
 * Does NOT touch DTV, trade engine, or any existing tables.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg }    from '@prisma/adapter-pg';
import * as dotenv     from 'dotenv';
import * as path       from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ── 2026 Rookie Rankings Dataset v2.0 ────────────────────────────────────────
// Source: Russell Hansen — FiQ Rookie Rankings Engine v2.0
// Draft Capital (30%) removed from base FiQ Score — now handled by Opportunity Score engine.
// Fields: playerName, school, position, nflGrade (decimal), fiqGrade (0-100),
//         eliteScore, marketScore, overallPick, draftCap (kept for display),
//         baseFiQScore (= fiqScore without draft capital), fiqTier (manually assigned)
//         height (optional, e.g. "6'4 1/8\""), weight (optional lbs), fortyTime (optional)

const SEASON = '2026';

const players = [
    // ── Quarterbacks ──────────────────────────────────────────────────────────
    // nflGrade = decimal NFL scout grade | fiqGrade/eliteScore/marketScore = 0-100
    { playerName: 'Fernando Mendoza',   school: 'Indiana',            position: 'QB', nflGrade: 6.73, fiqGrade: 88, eliteScore: 86, marketScore: 79, overallPick: 1,   draftCap: 100.0, fiqScore: 60.1, fiqTier: 'Tier 1' },
    { playerName: 'Ty Simpson',         school: 'Alabama',            position: 'QB', nflGrade: 6.30, fiqGrade: 84, eliteScore: 74, marketScore: 73, overallPick: 13,  draftCap: 97.6,  fiqScore: 54.7, fiqTier: 'Tier 2' },
    { playerName: 'Carson Beck',        school: 'Miami',              position: 'QB', nflGrade: 6.14, fiqGrade: 82, eliteScore: 74, marketScore: 70, overallPick: 65,  draftCap: 87.2,  fiqScore: 53.8, fiqTier: 'Tier 3' },
    { playerName: 'Drew Allar',         school: 'Penn State',         position: 'QB', nflGrade: 5.98, fiqGrade: 80, eliteScore: 72, marketScore: 72, overallPick: 76,  draftCap: 85.0,  fiqScore: 52.8, fiqTier: 'Tier 3' },
    { playerName: 'Cade Klubnik',       school: 'Clemson',            position: 'QB', nflGrade: 5.96, fiqGrade: 80, eliteScore: 76, marketScore: 68, overallPick: 110, draftCap: 78.2,  fiqScore: 53.6, fiqTier: 'Tier 3' },
    { playerName: 'Taylen Green',       school: 'Arkansas',           position: 'QB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 77, marketScore: 70, overallPick: 182, draftCap: 63.8,  fiqScore: 54.4, fiqTier: 'Tier 3' },
    { playerName: 'Cole Payton',        school: 'North Dakota State', position: 'QB', nflGrade: 5.91, fiqGrade: 80, eliteScore: 74, marketScore: 70, overallPick: 178, draftCap: 64.6,  fiqScore: 53.2, fiqTier: 'Tier 3' },
    { playerName: 'Garrett Nussmeier',  school: 'LSU',                position: 'QB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 70, marketScore: 68, overallPick: 249, draftCap: 50.4,  fiqScore: 52.1, fiqTier: 'Tier 4' },
    { playerName: 'Behren Morton',      school: 'Texas Tech',         position: 'QB', nflGrade: 5.68, fiqGrade: 77, eliteScore: 69, marketScore: 68, overallPick: 234, draftCap: 53.4,  fiqScore: 50.6, fiqTier: 'Tier 4' },
    { playerName: 'Diego Pavia',        school: 'Vanderbilt',         position: 'QB', nflGrade: 5.95, fiqGrade: 80, eliteScore: 71, marketScore: 69, overallPick: 261, draftCap: 48.0,  fiqScore: 52.2, fiqTier: 'Tier 4' },
    { playerName: 'Haynes King',        school: 'Georgia Tech',       position: 'QB', nflGrade: 5.80, fiqGrade: 79, eliteScore: 72, marketScore: 66, overallPick: 261, draftCap: 48.0,  fiqScore: 51.9, fiqTier: 'Tier 4' },
    { playerName: 'Athan Kaliakmanis',  school: 'Rutgers',            position: 'QB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 64, marketScore: 62, overallPick: 223, draftCap: 55.6,  fiqScore: 48.5, fiqTier: 'Tier 4' },
    { playerName: 'Jalon Daniels',      school: 'Kansas',             position: 'QB', nflGrade: 5.66, fiqGrade: 77, eliteScore: 68, marketScore: 69, overallPick: 261, draftCap: 48.0,  fiqScore: 50.4, fiqTier: 'Tier 4' },
    { playerName: 'Joey Aguilar',       school: 'Tennessee',          position: 'QB', nflGrade: 5.95, fiqGrade: 80, eliteScore: 72, marketScore: 68, overallPick: 300, draftCap: 40.2,  fiqScore: 52.4, fiqTier: 'Tier 4' },
    { playerName: 'Sawyer Robertson',   school: 'Baylor',             position: 'QB', nflGrade: 5.85, fiqGrade: 79, eliteScore: 67, marketScore: 67, overallPick: 300, draftCap: 40.2,  fiqScore: 50.5, fiqTier: 'Tier 4' },
    { playerName: 'Joe Fagnano',        school: 'Connecticut',        position: 'QB', nflGrade: 5.66, fiqGrade: 77, eliteScore: 69, marketScore: 67, overallPick: 300, draftCap: 40.2,  fiqScore: 50.5, fiqTier: 'Tier 4' },
    { playerName: 'Luke Altmyer',       school: 'Illinois',           position: 'QB', nflGrade: 5.68, fiqGrade: 77, eliteScore: 64, marketScore: 68, overallPick: 300, draftCap: 40.2,  fiqScore: 49.1, fiqTier: 'Tier 4' },

    // ── Running Backs ─────────────────────────────────────────────────────────
    { playerName: 'Jeremiyah Love',     school: 'Notre Dame',         position: 'RB', nflGrade: 6.73, fiqGrade: 88, eliteScore: 96, marketScore: 89, overallPick: 3,   draftCap: 99.6,  fiqScore: 64.1, fiqTier: 'Tier 1' },
    { playerName: 'Jadarian Price',     school: 'Notre Dame',         position: 'RB', nflGrade: 6.38, fiqGrade: 84, eliteScore: 75, marketScore: 80, overallPick: 32,  draftCap: 93.8,  fiqScore: 55.7, fiqTier: 'Tier 2' },
    { playerName: 'Jonah Coleman',      school: 'Washington',         position: 'RB', nflGrade: 5.94, fiqGrade: 80, eliteScore: 77, marketScore: 74, overallPick: 108, draftCap: 78.6,  fiqScore: 54.5, fiqTier: 'Tier 3' },
    { playerName: 'Mike Washington Jr', school: 'Arkansas',           position: 'RB', nflGrade: 6.24, fiqGrade: 83, eliteScore: 70, marketScore: 76, overallPick: 122, draftCap: 75.8,  fiqScore: 53.5, fiqTier: 'Tier 3' },
    { playerName: 'Nicholas Singleton', school: 'Penn State',         position: 'RB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 78, marketScore: 78, overallPick: 165, draftCap: 67.2,  fiqScore: 55.5, fiqTier: 'Tier 3' },
    { playerName: 'Emmett Johnson',     school: 'Nebraska',           position: 'RB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 73, marketScore: 79, overallPick: 161, draftCap: 68.0,  fiqScore: 54.1, fiqTier: 'Tier 3' },
    { playerName: 'Adam Randall',       school: 'Clemson',            position: 'RB', nflGrade: 6.13, fiqGrade: 82, eliteScore: 74, marketScore: 74, overallPick: 166, draftCap: 67.0,  fiqScore: 54.2, fiqTier: 'Tier 3' },
    { playerName: 'Kaelon Black',       school: 'Indiana',            position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 62, marketScore: 70, overallPick: 90,  draftCap: 82.2,  fiqScore: 48.7, fiqTier: 'Tier 3' },
    { playerName: 'Kaytron Allen',      school: 'Penn State',         position: 'RB', nflGrade: 5.97, fiqGrade: 80, eliteScore: 69, marketScore: 80, overallPick: 187, draftCap: 62.8,  fiqScore: 52.7, fiqTier: 'Tier 3' },
    { playerName: 'Demond Claiborne',   school: 'Wake Forest',        position: 'RB', nflGrade: 6.10, fiqGrade: 82, eliteScore: 67, marketScore: 70, overallPick: 198, draftCap: 60.6,  fiqScore: 51.7, fiqTier: 'Tier 4' },
    { playerName: 'Eli Heidenreich',    school: 'Navy',               position: 'RB', nflGrade: 5.86, fiqGrade: 79, eliteScore: 73, marketScore: 67, overallPick: 230, draftCap: 54.2,  fiqScore: 52.3, fiqTier: 'Tier 4' },
    { playerName: 'Seth McGowan',       school: 'Kentucky',           position: 'RB', nflGrade: 5.97, fiqGrade: 80, eliteScore: 69, marketScore: 65, overallPick: 237, draftCap: 52.8,  fiqScore: 51.2, fiqTier: 'Tier 4' },
    { playerName: 'CJ Donaldson',       school: 'West Virginia',      position: 'RB', nflGrade: 5.82, fiqGrade: 79, eliteScore: 63, marketScore: 79, overallPick: 262, draftCap: 47.8,  fiqScore: 50.5, fiqTier: 'Tier 4' },
    { playerName: 'Jam Miller',         school: 'Alabama',            position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 59, marketScore: 66, overallPick: 245, draftCap: 51.2,  fiqScore: 47.4, fiqTier: 'Tier 4' },
    { playerName: "Le'Veon Moss",       school: 'Texas A&M',          position: 'RB', nflGrade: 6.10, fiqGrade: 82, eliteScore: 55, marketScore: 68, overallPick: 261, draftCap: 48.0,  fiqScore: 47.9, fiqTier: 'Tier 4' },
    { playerName: 'Dean Connors',       school: 'Rice',               position: 'RB', nflGrade: 5.67, fiqGrade: 77, eliteScore: 68, marketScore: 64, overallPick: 295, draftCap: 41.2,  fiqScore: 49.9, fiqTier: 'Tier 4' },
    { playerName: "J'Mari Taylor",      school: 'Memphis',            position: 'RB', nflGrade: 5.99, fiqGrade: 80, eliteScore: 65, marketScore: 64, overallPick: 300, draftCap: 40.2,  fiqScore: 49.9, fiqTier: 'Tier 4' },
    { playerName: 'Chip Trayanum',      school: 'Ohio State',         position: 'RB', nflGrade: 5.85, fiqGrade: 79, eliteScore: 60, marketScore: 55, overallPick: 261, draftCap: 48.0,  fiqScore: 47.2, fiqTier: 'Tier 4' },
    { playerName: 'Rahsul Faison',      school: 'Coastal Carolina',   position: 'RB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 61, marketScore: 65, overallPick: 300, draftCap: 40.2,  fiqScore: 49.1, fiqTier: 'Tier 4' },
    { playerName: 'Noah Whittington',   school: 'Oregon',             position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 58, marketScore: 66, overallPick: 270, draftCap: 46.2,  fiqScore: 47.1, fiqTier: 'Tier 4' },
    { playerName: 'Jaydn Ott',          school: 'Cal',                position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 60, marketScore: 60, overallPick: 280, draftCap: 44.2,  fiqScore: 47.1, fiqTier: 'Tier 4' },
    { playerName: 'Roman Hemby',        school: 'Maryland',           position: 'RB', nflGrade: 5.98, fiqGrade: 80, eliteScore: 58, marketScore: 66, overallPick: 300, draftCap: 40.2,  fiqScore: 48.0, fiqTier: 'Tier 4' },
    { playerName: 'Jamal Haynes',       school: 'Georgia Tech',       position: 'RB', nflGrade: 5.65, fiqGrade: 77, eliteScore: 60, marketScore: 64, overallPick: 300, draftCap: 40.2,  fiqScore: 47.5, fiqTier: 'Tier 4' },
    { playerName: 'Sam Scott',          school: 'Wyoming',            position: 'RB', nflGrade: 5.65, fiqGrade: 77, eliteScore: 60, marketScore: 63, overallPick: 300, draftCap: 40.2,  fiqScore: 47.4, fiqTier: 'Tier 4' },
    { playerName: 'Barika Kpeenu',      school: 'North Dakota State', position: 'RB', nflGrade: 5.68, fiqGrade: 77, eliteScore: 60, marketScore: 56, overallPick: 297, draftCap: 40.8,  fiqScore: 46.7, fiqTier: 'Tier 4' },
    { playerName: 'Davon Booth',        school: 'Utah State',         position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 60, marketScore: 55, overallPick: 298, draftCap: 40.6,  fiqScore: 46.6, fiqTier: 'Tier 4' },
    { playerName: 'Al-Jay Henderson',   school: 'Coastal Carolina',   position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 60, marketScore: 55, overallPick: 299, draftCap: 40.4,  fiqScore: 46.6, fiqTier: 'Tier 4' },
    { playerName: 'Robert Henry Jr',    school: 'New Mexico State',   position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 57, marketScore: 58, overallPick: 296, draftCap: 41.0,  fiqScore: 46.0, fiqTier: 'Tier 4' },
    { playerName: 'Kentrel Bullock',    school: 'South Alabama',      position: 'RB', nflGrade: 5.67, fiqGrade: 77, eliteScore: 56, marketScore: 56, overallPick: 296, draftCap: 41.0,  fiqScore: 45.5, fiqTier: 'Tier 4' },
    { playerName: 'Desmond Reid',       school: 'Western Carolina',   position: 'RB', nflGrade: 5.92, fiqGrade: 80, eliteScore: 68, marketScore: 0,  overallPick: 300, draftCap: 40.2,  fiqScore: 44.4, fiqTier: 'Tier 4' },

    // ── Wide Receivers ────────────────────────────────────────────────────────
    // nflGrade = decimal NFL scout grade (athleticism composite)
    { playerName: 'Jordyn Tyson',           school: 'Arizona State',      position: 'WR', nflGrade: 6.43, fiqGrade: 85, eliteScore: 86, marketScore: 84, overallPick: 8,   draftCap: 98.6,  fiqScore: 59.7, fiqTier: 'Tier 2' },
    { playerName: 'Carnell Tate',           school: 'Ohio State',         position: 'WR', nflGrade: 6.71, fiqGrade: 88, eliteScore: 77, marketScore: 82, overallPick: 4,   draftCap: 99.4,  fiqScore: 57.7, fiqTier: 'Tier 2' },
    { playerName: 'Makai Lemon',            school: 'USC',                position: 'WR', nflGrade: 6.47, fiqGrade: 85, eliteScore: 83, marketScore: 80, overallPick: 20,  draftCap: 96.2,  fiqScore: 58.4, fiqTier: 'Tier 2' },
    { playerName: 'Omar Cooper Jr.',        school: 'Indiana',            position: 'WR', nflGrade: 6.39, fiqGrade: 84, eliteScore: 79, marketScore: 81, overallPick: 30,  draftCap: 94.2,  fiqScore: 57.0, fiqTier: 'Tier 2' },
    { playerName: 'KC Concepcion',          school: 'Texas A&M',          position: 'WR', nflGrade: 6.42, fiqGrade: 85, eliteScore: 77, marketScore: 77, overallPick: 24,  draftCap: 95.4,  fiqScore: 56.3, fiqTier: 'Tier 2' },
    { playerName: 'Denzel Boston',          school: 'Washington',         position: 'WR', nflGrade: 6.40, fiqGrade: 85, eliteScore: 78, marketScore: 79, overallPick: 39,  draftCap: 92.4,  fiqScore: 56.8, fiqTier: 'Tier 2' },
    { playerName: "De'Zhaun Stribling",     school: 'Mississippi',        position: 'WR', nflGrade: 6.28, fiqGrade: 83, eliteScore: 76, marketScore: 78, overallPick: 33,  draftCap: 93.6,  fiqScore: 55.5, fiqTier: 'Tier 2' },
    { playerName: 'Germie Bernard',         school: 'Alabama',            position: 'WR', nflGrade: 6.29, fiqGrade: 83, eliteScore: 75, marketScore: 73, overallPick: 47,  draftCap: 90.8,  fiqScore: 54.7, fiqTier: 'Tier 2' },
    { playerName: 'Zachariah Branch',       school: 'Georgia',            position: 'WR', nflGrade: 6.32, fiqGrade: 84, eliteScore: 79, marketScore: 76, overallPick: 79,  draftCap: 84.4,  fiqScore: 56.5, fiqTier: 'Tier 2' },
    { playerName: 'Chris Brazzell II',      school: 'Tennessee',          position: 'WR', nflGrade: 6.36, fiqGrade: 84, eliteScore: 78, marketScore: 77, overallPick: 83,  draftCap: 83.6,  fiqScore: 56.3, fiqTier: 'Tier 2' },
    { playerName: 'Antonio Williams',       school: 'Clemson',            position: 'WR', nflGrade: 6.26, fiqGrade: 83, eliteScore: 75, marketScore: 74, overallPick: 71,  draftCap: 86.0,  fiqScore: 54.8, fiqTier: 'Tier 2' },
    { playerName: 'Malachi Fields',         school: 'Notre Dame',         position: 'WR', nflGrade: 6.27, fiqGrade: 83, eliteScore: 74, marketScore: 77, overallPick: 74,  draftCap: 85.4,  fiqScore: 54.8, fiqTier: 'Tier 2' },
    { playerName: 'Chris Bell',             school: 'Louisville',         position: 'WR', nflGrade: 6.24, fiqGrade: 83, eliteScore: 79, marketScore: 73, overallPick: 94,  draftCap: 81.4,  fiqScore: 55.9, fiqTier: 'Tier 2' },
    { playerName: "Ja'Kobi Lane",           school: 'USC',                position: 'WR', nflGrade: 6.20, fiqGrade: 83, eliteScore: 75, marketScore: 76, overallPick: 80,  draftCap: 84.2,  fiqScore: 55.0, fiqTier: 'Tier 2' },
    { playerName: 'Ted Hurst',              school: 'Georgia State',      position: 'WR', nflGrade: 6.19, fiqGrade: 82, eliteScore: 76, marketScore: 74, overallPick: 84,  draftCap: 83.4,  fiqScore: 54.8, fiqTier: 'Tier 3' },
    { playerName: 'Bryce Lance',            school: 'North Dakota State', position: 'WR', nflGrade: 6.17, fiqGrade: 82, eliteScore: 86, marketScore: 70, overallPick: 132, draftCap: 73.8,  fiqScore: 57.4, fiqTier: 'Tier 3' },
    { playerName: 'Elijah Sarratt',         school: 'Indiana',            position: 'WR', nflGrade: 6.19, fiqGrade: 82, eliteScore: 78, marketScore: 76, overallPick: 111, draftCap: 78.0,  fiqScore: 55.6, fiqTier: 'Tier 3' },
    { playerName: 'Skyler Bell',            school: 'Connecticut',        position: 'WR', nflGrade: 6.31, fiqGrade: 84, eliteScore: 78, marketScore: 75, overallPick: 125, draftCap: 75.2,  fiqScore: 56.1, fiqTier: 'Tier 3' },
    { playerName: 'Caleb Douglas',          school: 'Texas Tech',         position: 'WR', nflGrade: 5.95, fiqGrade: 80, eliteScore: 73, marketScore: 60, overallPick: 74,  draftCap: 85.4,  fiqScore: 51.9, fiqTier: 'Tier 3' },
    { playerName: 'Brenen Thompson',        school: 'Mississippi State',  position: 'WR', nflGrade: 5.89, fiqGrade: 79, eliteScore: 77, marketScore: 58, overallPick: 101, draftCap: 80.0,  fiqScore: 52.6, fiqTier: 'Tier 3' },
    { playerName: 'Zavion Thomas',          school: 'LSU',                position: 'WR', nflGrade: 5.87, fiqGrade: 79, eliteScore: 69, marketScore: 62, overallPick: 89,  draftCap: 82.4,  fiqScore: 50.6, fiqTier: 'Tier 3' },
    { playerName: 'Colbie Young',           school: 'Georgia',            position: 'WR', nflGrade: 5.96, fiqGrade: 80, eliteScore: 70, marketScore: 66, overallPick: 136, draftCap: 73.0,  fiqScore: 51.6, fiqTier: 'Tier 3' },
    { playerName: 'Kendrick Law',           school: 'Kentucky',           position: 'WR', nflGrade: 5.95, fiqGrade: 80, eliteScore: 70, marketScore: 59, overallPick: 160, draftCap: 68.2,  fiqScore: 50.9, fiqTier: 'Tier 3' },
    { playerName: 'Reggie Virgil',          school: 'Texas Tech',         position: 'WR', nflGrade: 5.99, fiqGrade: 80, eliteScore: 64, marketScore: 59, overallPick: 131, draftCap: 74.0,  fiqScore: 49.1, fiqTier: 'Tier 3' },
    { playerName: 'Deion Burks',            school: 'Oklahoma',           position: 'WR', nflGrade: 6.18, fiqGrade: 82, eliteScore: 76, marketScore: 71, overallPick: 225, draftCap: 55.2,  fiqScore: 54.5, fiqTier: 'Tier 3' },
    { playerName: 'Kaden Wetjen',           school: 'Iowa',               position: 'WR', nflGrade: 5.98, fiqGrade: 80, eliteScore: 61, marketScore: 59, overallPick: 121, draftCap: 76.0,  fiqScore: 48.2, fiqTier: 'Tier 3' },
    { playerName: 'Barion Brown',           school: 'LSU',                position: 'WR', nflGrade: 5.86, fiqGrade: 79, eliteScore: 72, marketScore: 61, overallPick: 177, draftCap: 64.8,  fiqScore: 51.4, fiqTier: 'Tier 3' },
    { playerName: 'Josh Cameron',           school: 'Baylor',             position: 'WR', nflGrade: 6.00, fiqGrade: 81, eliteScore: 70, marketScore: 60, overallPick: 178, draftCap: 64.6,  fiqScore: 51.3, fiqTier: 'Tier 3' },
    { playerName: 'Malik Benson',           school: 'Oregon',             position: 'WR', nflGrade: 6.00, fiqGrade: 81, eliteScore: 68, marketScore: 68, overallPick: 182, draftCap: 63.8,  fiqScore: 51.5, fiqTier: 'Tier 3' },
    { playerName: 'CJ Daniels',             school: 'Miami',              position: 'WR', nflGrade: 5.84, fiqGrade: 79, eliteScore: 72, marketScore: 58, overallPick: 184, draftCap: 63.4,  fiqScore: 51.1, fiqTier: 'Tier 3' },
    { playerName: 'Kevin Coleman Jr.',      school: 'Missouri',           position: 'WR', nflGrade: 5.99, fiqGrade: 80, eliteScore: 66, marketScore: 59, overallPick: 169, draftCap: 66.4,  fiqScore: 49.7, fiqTier: 'Tier 4' },
    { playerName: 'Jeff Caldwell',          school: 'Cincinnati',         position: 'WR', nflGrade: 6.00, fiqGrade: 81, eliteScore: 78, marketScore: 60, overallPick: 261, draftCap: 48.0,  fiqScore: 53.7, fiqTier: 'Tier 4' },
    { playerName: 'Emmanuel Henderson Jr.', school: 'Kansas',             position: 'WR', nflGrade: 5.88, fiqGrade: 79, eliteScore: 63, marketScore: 58, overallPick: 186, draftCap: 63.0,  fiqScore: 48.4, fiqTier: 'Tier 4' },
    { playerName: 'J. Michael Sturdivant',  school: 'Florida',            position: 'WR', nflGrade: 6.10, fiqGrade: 82, eliteScore: 71, marketScore: 64, overallPick: 261, draftCap: 48.0,  fiqScore: 52.3, fiqTier: 'Tier 4' },
    { playerName: 'Dillon Bell',            school: 'Georgia',            position: 'WR', nflGrade: 5.94, fiqGrade: 80, eliteScore: 70, marketScore: 59, overallPick: 261, draftCap: 48.0,  fiqScore: 50.9, fiqTier: 'Tier 4' },
    { playerName: 'Eric McAlister',         school: 'TCU',                position: 'WR', nflGrade: 5.97, fiqGrade: 80, eliteScore: 68, marketScore: 59, overallPick: 261, draftCap: 48.0,  fiqScore: 50.3, fiqTier: 'Tier 4' },

    // ── Tight Ends ────────────────────────────────────────────────────────────
    { playerName: 'Kenyon Sadiq',       school: 'Oregon',       position: 'TE', nflGrade: 6.46, fiqGrade: 85, eliteScore: 93, marketScore: 84, overallPick: 16,  draftCap: 97.0,  fiqScore: 61.8, fiqTier: 'Tier 1' },
    { playerName: 'Eli Stowers',        school: 'Vanderbilt',   position: 'TE', nflGrade: 6.24, fiqGrade: 83, eliteScore: 85, marketScore: 80, overallPick: 54,  draftCap: 89.4,  fiqScore: 58.4, fiqTier: 'Tier 2' },
    { playerName: 'Max Klare',          school: 'Ohio State',   position: 'TE', nflGrade: 6.30, fiqGrade: 84, eliteScore: 76, marketScore: 78, overallPick: 61,  draftCap: 88.0,  fiqScore: 55.8, fiqTier: 'Tier 2' },
    { playerName: 'Oscar Delp',         school: 'Georgia',      position: 'TE', nflGrade: 6.13, fiqGrade: 82, eliteScore: 76, marketScore: 76, overallPick: 73,  draftCap: 85.6,  fiqScore: 55.0, fiqTier: 'Tier 2' },
    { playerName: 'Sam Roush',          school: 'Stanford',     position: 'TE', nflGrade: 6.26, fiqGrade: 83, eliteScore: 74, marketScore: 71, overallPick: 69,  draftCap: 86.4,  fiqScore: 54.2, fiqTier: 'Tier 2' },
    { playerName: 'Marlin Klein',       school: 'Michigan',     position: 'TE', nflGrade: 6.10, fiqGrade: 82, eliteScore: 65, marketScore: 71, overallPick: 59,  draftCap: 88.4,  fiqScore: 51.2, fiqTier: 'Tier 3' },
    { playerName: 'Eli Raridon',        school: 'Notre Dame',   position: 'TE', nflGrade: 6.14, fiqGrade: 82, eliteScore: 70, marketScore: 73, overallPick: 95,  draftCap: 81.2,  fiqScore: 52.9, fiqTier: 'Tier 3' },
    { playerName: 'Nate Boerkircher',   school: 'Texas A&M',    position: 'TE', nflGrade: 6.17, fiqGrade: 82, eliteScore: 71, marketScore: 47, overallPick: 56,  draftCap: 89.0,  fiqScore: 50.6, fiqTier: 'Tier 3' },
    { playerName: 'Will Kacmarek',      school: 'Ohio State',   position: 'TE', nflGrade: 6.12, fiqGrade: 82, eliteScore: 66, marketScore: 66, overallPick: 87,  draftCap: 82.8,  fiqScore: 51.0, fiqTier: 'Tier 3' },
    { playerName: 'Matthew Hibner',     school: 'SMU',          position: 'TE', nflGrade: 5.97, fiqGrade: 80, eliteScore: 69, marketScore: 64, overallPick: 129, draftCap: 74.4,  fiqScore: 51.1, fiqTier: 'Tier 3' },
    { playerName: 'Justin Joly',        school: 'NC State',     position: 'TE', nflGrade: 6.16, fiqGrade: 82, eliteScore: 71, marketScore: 61, overallPick: 140, draftCap: 72.2,  fiqScore: 52.0, fiqTier: 'Tier 3' },
    { playerName: 'Tanner Koziol',      school: 'Houston',      position: 'TE', nflGrade: 5.95, fiqGrade: 80, eliteScore: 70, marketScore: 52, overallPick: 152, draftCap: 69.8,  fiqScore: 50.2, fiqTier: 'Tier 3' },
    { playerName: 'Jack Endries',       school: 'Texas',        position: 'TE', nflGrade: 6.13, fiqGrade: 82, eliteScore: 71, marketScore: 66, overallPick: 197, draftCap: 60.8,  fiqScore: 52.5, fiqTier: 'Tier 3' },
    { playerName: 'Josh Cuevas',        school: 'Alabama',      position: 'TE', nflGrade: 5.99, fiqGrade: 80, eliteScore: 68, marketScore: 62, overallPick: 168, draftCap: 66.6,  fiqScore: 50.6, fiqTier: 'Tier 3' },
    { playerName: 'Bauer Sharp',        school: 'LSU',          position: 'TE', nflGrade: 5.67, fiqGrade: 77, eliteScore: 74, marketScore: 40, overallPick: 164, draftCap: 67.4,  fiqScore: 49.3, fiqTier: 'Tier 4' },
    { playerName: 'Dallen Bentley',     school: 'Utah',         position: 'TE', nflGrade: 5.84, fiqGrade: 79, eliteScore: 77, marketScore: 62, overallPick: 232, draftCap: 53.8,  fiqScore: 53.0, fiqTier: 'Tier 4' },
    { playerName: 'Riley Nowakowski',   school: 'Indiana',      position: 'TE', nflGrade: 6.11, fiqGrade: 82, eliteScore: 63, marketScore: 61, overallPick: 165, draftCap: 67.2,  fiqScore: 49.6, fiqTier: 'Tier 4' },
    { playerName: 'Joe Royer',          school: 'Cincinnati',   position: 'TE', nflGrade: 6.12, fiqGrade: 82, eliteScore: 68, marketScore: 46, overallPick: 166, draftCap: 67.0,  fiqScore: 49.6, fiqTier: 'Tier 4' },
    { playerName: 'Jaren Kanak',        school: 'Oklahoma',     position: 'TE', nflGrade: 5.85, fiqGrade: 79, eliteScore: 64, marketScore: 66, overallPick: 201, draftCap: 60.0,  fiqScore: 49.5, fiqTier: 'Tier 4' },

    // ── IDP — Defensive Line ──────────────────────────────────────────────────
    { playerName: 'Arvell Reese',        school: 'Ohio State',   position: 'EDGE', nflGrade: 7.04, fiqGrade: 91, eliteScore: 84, marketScore: 87, overallPick: 5,   draftCap: 99.2, fiqScore: 61.2, fiqTier: 'Tier 1', height: "6'4 1/8\"",  weight: 241, fortyTime: 4.46 },
    { playerName: 'Caleb Banks',         school: 'Florida',      position: 'DT',   nflGrade: 6.37, fiqGrade: 84, eliteScore: 73, marketScore: 80, overallPick: 18,  draftCap: 96.6, fiqScore: 55.1, fiqTier: 'Tier 2', height: "6'6 1/4\"",  weight: 327, fortyTime: 5.04 },
    { playerName: 'Peter Woods',         school: 'Clemson',      position: 'DT',   nflGrade: 6.36, fiqGrade: 84, eliteScore: 77, marketScore: 76, overallPick: 29,  draftCap: 94.4, fiqScore: 55.9, fiqTier: 'Tier 2', height: "6'2 1/2\"",  weight: 298, fortyTime: 4.78 },
    { playerName: 'Kayden McDonald',     school: 'Ohio State',   position: 'DT',   nflGrade: 6.39, fiqGrade: 84, eliteScore: 72, marketScore: 78, overallPick: 36,  draftCap: 93.0, fiqScore: 54.6, fiqTier: 'Tier 3', height: "6'2 1/8\"",  weight: 326, fortyTime: 5.15 },
    { playerName: 'Lee Hunter',          school: 'Texas Tech',   position: 'DT',   nflGrade: 6.24, fiqGrade: 83, eliteScore: 73, marketScore: 76, overallPick: 49,  draftCap: 90.4, fiqScore: 54.4, fiqTier: 'Tier 3', height: "6'3 1/2\"",  weight: 318, fortyTime: 5.18 },
    { playerName: 'Christen Miller',     school: 'Georgia',      position: 'DT',   nflGrade: 6.34, fiqGrade: 84, eliteScore: 73, marketScore: 73, overallPick: 42,  draftCap: 91.8, fiqScore: 54.4, fiqTier: 'Tier 3', height: "6'3 3/4\"",  weight: 321, fortyTime: 4.90 },
    { playerName: 'Tyler Onyedim',       school: 'Texas A&M',    position: 'DT',   nflGrade: 6.21, fiqGrade: 83, eliteScore: 61, marketScore: 70, overallPick: 66,  draftCap: 87.0, fiqScore: 50.2, fiqTier: 'Tier 3', height: "6'3 1/2\"",  weight: 292, fortyTime: 5.07 },
    { playerName: 'Domonique Orange',    school: 'Iowa State',   position: 'DT',   nflGrade: 6.26, fiqGrade: 83, eliteScore: 67, marketScore: 71, overallPick: 82,  draftCap: 83.8, fiqScore: 52.1, fiqTier: 'Tier 3', height: "6'2 3/8\"",  weight: 322, fortyTime: 5.17 },
    { playerName: 'Albert Regis',        school: 'Texas A&M',    position: 'DT',   nflGrade: 6.15, fiqGrade: 82, eliteScore: 63, marketScore: 62, overallPick: 81,  draftCap: 84.0, fiqScore: 49.7, fiqTier: 'Tier 4', height: "6'1 3/8\"",  weight: 295, fortyTime: 4.88 },
    { playerName: 'DeMonte Capehart',    school: 'Clemson',      position: 'DT',   nflGrade: 6.18, fiqGrade: 82, eliteScore: 71, marketScore: 64, overallPick: 143, draftCap: 71.6, fiqScore: 52.3, fiqTier: 'Tier 3', height: "6'4 7/8\"",  weight: 313, fortyTime: 4.85 },

    // ── IDP — EDGE / DE ───────────────────────────────────────────────────────
    { playerName: 'David Bailey',        school: 'Texas Tech',   position: 'EDGE', nflGrade: 6.78, fiqGrade: 88, eliteScore: 86, marketScore: 81, overallPick: 2,   draftCap: 99.8, fiqScore: 60.3, fiqTier: 'Tier 1', height: "6'3 5/8\"",  weight: 251, fortyTime: 4.50 },
    { playerName: 'Rueben Bain Jr.',     school: 'Miami',        position: 'EDGE', nflGrade: 6.70, fiqGrade: 88, eliteScore: 84, marketScore: 84, overallPick: 15,  draftCap: 97.2, fiqScore: 60.0, fiqTier: 'Tier 2', height: "6'2 1/4\"",  weight: 263, fortyTime: 4.73 },
    { playerName: 'Akheem Mesidor',      school: 'Miami',        position: 'EDGE', nflGrade: 6.42, fiqGrade: 85, eliteScore: 78, marketScore: 77, overallPick: 22,  draftCap: 95.8, fiqScore: 56.6, fiqTier: 'Tier 2', height: "6'3\"",      weight: 259, fortyTime: 4.64 },
    { playerName: 'Keldric Faulk',       school: 'Auburn',       position: 'EDGE', nflGrade: 6.43, fiqGrade: 85, eliteScore: 78, marketScore: 79, overallPick: 31,  draftCap: 94.0, fiqScore: 56.8, fiqTier: 'Tier 2', height: "6'5 7/8\"",  weight: 276, fortyTime: 4.67 },
    { playerName: 'Malachi Lawrence',    school: 'UCF',          position: 'EDGE', nflGrade: 6.34, fiqGrade: 84, eliteScore: 74, marketScore: 77, overallPick: 23,  draftCap: 95.6, fiqScore: 55.1, fiqTier: 'Tier 2', height: "6'4 3/8\"",  weight: 253, fortyTime: 4.52 },
    { playerName: 'TJ Parker',           school: 'Clemson',      position: 'EDGE', nflGrade: 6.29, fiqGrade: 83, eliteScore: 78, marketScore: 76, overallPick: 35,  draftCap: 93.2, fiqScore: 55.9, fiqTier: 'Tier 2', height: "6'3 5/8\"",  weight: 263, fortyTime: 4.68 },
    { playerName: 'Cashius Howell',      school: 'Texas A&M',    position: 'EDGE', nflGrade: 6.38, fiqGrade: 84, eliteScore: 76, marketScore: 76, overallPick: 41,  draftCap: 92.0, fiqScore: 55.6, fiqTier: 'Tier 2', height: "6'2 1/2\"",  weight: 253, fortyTime: 4.59 },
    { playerName: 'Gabe Jacas',          school: 'Illinois',     position: 'EDGE', nflGrade: 6.33, fiqGrade: 84, eliteScore: 77, marketScore: 75, overallPick: 55,  draftCap: 89.2, fiqScore: 55.8, fiqTier: 'Tier 2', height: "6'3 5/8\"",  weight: 260, fortyTime: 4.69 },
    { playerName: 'R. Mason Thomas',     school: 'Oklahoma',     position: 'EDGE', nflGrade: 6.28, fiqGrade: 83, eliteScore: 69, marketScore: 70, overallPick: 40,  draftCap: 92.2, fiqScore: 52.6, fiqTier: 'Tier 3', height: "6'2 1/4\"",  weight: 241, fortyTime: 4.67 },
    { playerName: 'Derrick Moore',       school: 'Michigan',     position: 'EDGE', nflGrade: 6.30, fiqGrade: 84, eliteScore: 69, marketScore: 78, overallPick: 44,  draftCap: 91.4, fiqScore: 53.7, fiqTier: 'Tier 3', height: "6'3 7/8\"",  weight: 255, fortyTime: 4.65 },
    { playerName: 'Zion Young',          school: 'Missouri',     position: 'EDGE', nflGrade: 6.40, fiqGrade: 85, eliteScore: 72, marketScore: 76, overallPick: 45,  draftCap: 91.2, fiqScore: 54.7, fiqTier: 'Tier 3', height: "6'5 3/4\"",  weight: 262, fortyTime: 4.73 },
    { playerName: 'Romello Height',      school: 'Texas Tech',   position: 'EDGE', nflGrade: 6.19, fiqGrade: 82, eliteScore: 74, marketScore: 68, overallPick: 70,  draftCap: 86.2, fiqScore: 53.6, fiqTier: 'Tier 3', height: "6'2 3/4\"",  weight: 239, fortyTime: 4.64 },
    { playerName: 'Keyron Crawford',     school: 'Auburn',       position: 'DE',   nflGrade: 6.26, fiqGrade: 83, eliteScore: 67, marketScore: 66, overallPick: 67,  draftCap: 86.8, fiqScore: 51.6, fiqTier: 'Tier 3', height: "6'4 3/8\"",  weight: 253, fortyTime: 4.80 },
    { playerName: 'Jaishawn Barham',     school: 'Michigan',     position: 'EDGE', nflGrade: 6.28, fiqGrade: 83, eliteScore: 63, marketScore: 70, overallPick: 92,  draftCap: 81.8, fiqScore: 50.8, fiqTier: 'Tier 3', height: "6'3 1/2\"",  weight: 240, fortyTime: 4.64 },
    { playerName: 'Dani Dennis-Sutton',  school: 'Penn State',   position: 'EDGE', nflGrade: 6.18, fiqGrade: 82, eliteScore: 79, marketScore: 71, overallPick: 116, draftCap: 77.0, fiqScore: 55.4, fiqTier: 'Tier 3', height: "6'5 5/8\"",  weight: 256, fortyTime: 4.63 },
    { playerName: 'Joshua Josephs',      school: 'Tennessee',    position: 'EDGE', nflGrade: 6.24, fiqGrade: 83, eliteScore: 71, marketScore: 64, overallPick: 135, draftCap: 73.2, fiqScore: 52.6, fiqTier: 'Tier 3', height: "6'3 1/8\"",  weight: 242, fortyTime: 4.73 },
    { playerName: 'LT Overton',          school: 'Alabama',      position: 'EDGE', nflGrade: 6.15, fiqGrade: 82, eliteScore: 66, marketScore: 64, overallPick: 133, draftCap: 73.6, fiqScore: 50.8, fiqTier: 'Tier 4', height: "6'3\"",      weight: 274, fortyTime: 4.87 },
    { playerName: 'Wesley Williams',     school: 'Duke',         position: 'EDGE', nflGrade: 5.99, fiqGrade: 80, eliteScore: 63, marketScore: 60, overallPick: 115, draftCap: 77.2, fiqScore: 48.9, fiqTier: 'Tier 4', height: "6'3 3/4\"",  weight: 256, fortyTime: 4.89 },
    { playerName: 'George Gumbs Jr.',    school: 'Florida',      position: 'EDGE', nflGrade: 5.99, fiqGrade: 80, eliteScore: 65, marketScore: 60, overallPick: 144, draftCap: 71.4, fiqScore: 49.5, fiqTier: 'Tier 4', height: "6'4 3/8\"",  weight: 245, fortyTime: 4.66 },

    // ── IDP — Linebacker ─────────────────────────────────────────────────────
    { playerName: 'Sonny Styles',        school: 'Ohio State',   position: 'LB',   nflGrade: 6.48, fiqGrade: 85, eliteScore: 95, marketScore: 85, overallPick: 7,   draftCap: 98.8, fiqScore: 62.5, fiqTier: 'Tier 1', height: "6'5\"",      weight: 244, fortyTime: 4.46 },
    { playerName: 'Jake Golday',         school: 'Cincinnati',   position: 'LB',   nflGrade: 6.33, fiqGrade: 84, eliteScore: 83, marketScore: 77, overallPick: 51,  draftCap: 90.0, fiqScore: 57.8, fiqTier: 'Tier 2', height: "6'4 1/2\"",  weight: 239, fortyTime: 4.62 },
    { playerName: 'Anthony Hill Jr.',    school: 'Texas',        position: 'LB',   nflGrade: 6.39, fiqGrade: 84, eliteScore: 81, marketScore: 79, overallPick: 60,  draftCap: 88.2, fiqScore: 57.4, fiqTier: 'Tier 2', height: "6'2\"",      weight: 238, fortyTime: 4.51 },
    { playerName: 'Jacob Rodriguez',     school: 'Texas Tech',   position: 'LB',   nflGrade: 6.34, fiqGrade: 84, eliteScore: 78, marketScore: 81, overallPick: 43,  draftCap: 91.6, fiqScore: 56.7, fiqTier: 'Tier 2', height: "6'1 3/8\"",  weight: 231, fortyTime: 4.57 },
    { playerName: 'CJ Allen',            school: 'Georgia',      position: 'LB',   nflGrade: 6.29, fiqGrade: 83, eliteScore: 76, marketScore: 74, overallPick: 53,  draftCap: 89.6, fiqScore: 55.1, fiqTier: 'Tier 3', height: "6'0 3/4\"",  weight: 230, fortyTime: 4.47 },
    { playerName: 'Josiah Trotter',      school: 'Missouri',     position: 'LB',   nflGrade: 6.29, fiqGrade: 83, eliteScore: 70, marketScore: 71, overallPick: 46,  draftCap: 91.0, fiqScore: 53.0, fiqTier: 'Tier 3', height: "6'1 7/8\"",  weight: 237, fortyTime: 4.61 },
    { playerName: 'Kaleb Elarms-Orr',    school: 'TCU',          position: 'LB',   nflGrade: 6.12, fiqGrade: 82, eliteScore: 74, marketScore: 65, overallPick: 122, draftCap: 75.8, fiqScore: 53.3, fiqTier: 'Tier 3', height: "6'2\"",      weight: 234, fortyTime: 4.47 },
    { playerName: 'Kyle Louis',          school: 'Pittsburgh',   position: 'LB',   nflGrade: 6.30, fiqGrade: 84, eliteScore: 73, marketScore: 76, overallPick: 134, draftCap: 73.4, fiqScore: 54.7, fiqTier: 'Tier 3', height: "5'11 7/8\"", weight: 220, fortyTime: 4.53 },
    { playerName: 'Trey Moore',          school: 'Texas',        position: 'LB',   nflGrade: 6.13, fiqGrade: 82, eliteScore: 69, marketScore: 66, overallPick: 126, draftCap: 75.0, fiqScore: 51.9, fiqTier: 'Tier 3', height: "6'1 5/8\"",  weight: 243, fortyTime: 4.54 },
    { playerName: 'Jimmy Rolder',        school: 'Michigan',     position: 'LB',   nflGrade: 6.19, fiqGrade: 82, eliteScore: 68, marketScore: 68, overallPick: 114, draftCap: 77.4, fiqScore: 51.8, fiqTier: 'Tier 3', height: "6'2 1/2\"",  weight: 238, fortyTime: 4.64 },

    // ── IDP — Cornerback ─────────────────────────────────────────────────────
    { playerName: 'Mansoor Delane',      school: 'LSU',          position: 'CB',   nflGrade: 6.77, fiqGrade: 88, eliteScore: 84, marketScore: 81, overallPick: 6,   draftCap: 99.0, fiqScore: 59.7, fiqTier: 'Tier 2', height: "5'11 3/4\"", weight: 187, fortyTime: 4.38 },
    { playerName: 'Colton Hood',         school: 'Tennessee',    position: 'CB',   nflGrade: 6.38, fiqGrade: 84, eliteScore: 82, marketScore: 77, overallPick: 37,  draftCap: 92.8, fiqScore: 57.5, fiqTier: 'Tier 2', height: "5'11 5/8\"", weight: 193, fortyTime: 4.44 },
    { playerName: "D'Angelo Ponds",      school: 'Indiana',      position: 'CB',   nflGrade: 6.28, fiqGrade: 83, eliteScore: 81, marketScore: 80, overallPick: 50,  draftCap: 90.2, fiqScore: 57.2, fiqTier: 'Tier 2', height: "5'8 5/8\"",  weight: 182, fortyTime: 4.31 },
    { playerName: 'Chris Johnson',       school: 'San Diego State', position: 'CB', nflGrade: 6.35, fiqGrade: 84, eliteScore: 80, marketScore: 76, overallPick: 27,  draftCap: 94.8, fiqScore: 56.8, fiqTier: 'Tier 2', height: "6'0 3/8\"",  weight: 193, fortyTime: 4.40 },
    { playerName: 'Avieon Terrell',      school: 'Clemson',      position: 'CB',   nflGrade: 6.39, fiqGrade: 84, eliteScore: 75, marketScore: 78, overallPick: 48,  draftCap: 90.6, fiqScore: 55.5, fiqTier: 'Tier 2', height: "5'10 3/4\"", weight: 186, fortyTime: 4.38 },
    { playerName: 'Brandon Cisse',       school: 'South Carolina', position: 'CB', nflGrade: 6.27, fiqGrade: 83, eliteScore: 79, marketScore: 77, overallPick: 52,  draftCap: 89.8, fiqScore: 56.3, fiqTier: 'Tier 2', height: "5'11 3/4\"", weight: 189, fortyTime: 4.41 },
    { playerName: 'Jermod McCoy',        school: 'Tennessee',    position: 'CB',   nflGrade: 6.40, fiqGrade: 85, eliteScore: 81, marketScore: 80, overallPick: 97,  draftCap: 80.8, fiqScore: 57.8, fiqTier: 'Tier 2', height: "6'0 3/4\"",  weight: 188, fortyTime: 4.38 },
    { playerName: 'Tacario Davis',       school: 'Washington',   position: 'CB',   nflGrade: 6.15, fiqGrade: 82, eliteScore: 73, marketScore: 74, overallPick: 72,  draftCap: 85.8, fiqScore: 53.9, fiqTier: 'Tier 3', height: "6'3 7/8\"",  weight: 194, fortyTime: 4.41 },
    { playerName: 'Daylen Everette',     school: 'Georgia',      position: 'CB',   nflGrade: 6.11, fiqGrade: 82, eliteScore: 75, marketScore: 71, overallPick: 85,  draftCap: 83.2, fiqScore: 54.2, fiqTier: 'Tier 3', height: "6'1 1/4\"",  weight: 196, fortyTime: 4.38 },
    { playerName: 'Keionte Scott',       school: 'Miami',        position: 'CB',   nflGrade: 6.27, fiqGrade: 83, eliteScore: 72, marketScore: 79, overallPick: 112, draftCap: 77.8, fiqScore: 54.4, fiqTier: 'Tier 3', height: "5'11 1/4\"", weight: 193, fortyTime: 4.33 },
    { playerName: 'Malik Muhammad',      school: 'Texas',        position: 'CB',   nflGrade: 6.21, fiqGrade: 83, eliteScore: 73, marketScore: 76, overallPick: 120, draftCap: 76.2, fiqScore: 54.4, fiqTier: 'Tier 3', height: "6'0\"",      weight: 182, fortyTime: 4.42 },
    { playerName: 'Julian Neal',         school: 'Arkansas',     position: 'CB',   nflGrade: 5.99, fiqGrade: 80, eliteScore: 75, marketScore: 64, overallPick: 99,  draftCap: 80.4, fiqScore: 52.9, fiqTier: 'Tier 3', height: "6'1 5/8\"",  weight: 203, fortyTime: 4.49 },
    { playerName: 'Jadon Canady',        school: 'Oregon',       position: 'CB',   nflGrade: 6.19, fiqGrade: 82, eliteScore: 65, marketScore: 73, overallPick: 105, draftCap: 79.2, fiqScore: 51.4, fiqTier: 'Tier 3', height: "5'10 1/4\"", weight: 181, fortyTime: 4.50 },
    { playerName: 'Devin Moore',         school: 'Florida',      position: 'CB',   nflGrade: 6.00, fiqGrade: 81, eliteScore: 75, marketScore: 67, overallPick: 110, draftCap: 78.2, fiqScore: 53.5, fiqTier: 'Tier 3', height: "6'3 1/4\"",  weight: 198, fortyTime: 4.50 },
    { playerName: 'Davison Igbinosun',   school: 'Ohio State',   position: 'CB',   nflGrade: 6.00, fiqGrade: 81, eliteScore: 74, marketScore: 66, overallPick: 62,  draftCap: 87.8, fiqScore: 53.1, fiqTier: 'Tier 3', height: "6'2 1/8\"",  weight: 189, fortyTime: 4.45 },
    { playerName: 'Ephesians Prysock',   school: 'Washington',   position: 'CB',   nflGrade: 6.17, fiqGrade: 82, eliteScore: 74, marketScore: 72, overallPick: 135, draftCap: 73.2, fiqScore: 54.0, fiqTier: 'Tier 3', height: "6'3 3/8\"",  weight: 196, fortyTime: 4.45 },
    { playerName: 'Will Lee III',        school: 'Texas A&M',    position: 'CB',   nflGrade: 6.12, fiqGrade: 82, eliteScore: 71, marketScore: 74, overallPick: 125, draftCap: 75.2, fiqScore: 53.3, fiqTier: 'Tier 3', height: "6'1 1/2\"",  weight: 189, fortyTime: 4.52 },
    { playerName: 'Keith Abney II',      school: 'Arizona State', position: 'CB',  nflGrade: 6.20, fiqGrade: 83, eliteScore: 75, marketScore: 75, overallPick: 145, draftCap: 71.2, fiqScore: 54.9, fiqTier: 'Tier 3', height: "5'9 7/8\"",  weight: 187, fortyTime: 4.45 },
    { playerName: 'Chandler Rivers',     school: 'Duke',         position: 'CB',   nflGrade: 6.00, fiqGrade: 81, eliteScore: 76, marketScore: 70, overallPick: 150, draftCap: 70.2, fiqScore: 54.1, fiqTier: 'Tier 3', height: "5'9 1/2\"",  weight: 185, fortyTime: 4.40 },
    { playerName: 'Charles Demmings',    school: 'Stephen F. Austin State', position: 'CB', nflGrade: 5.99, fiqGrade: 80, eliteScore: 77, marketScore: 65, overallPick: 151, draftCap: 70.0, fiqScore: 53.6, fiqTier: 'Tier 3', height: "6'1 1/8\"", weight: 193, fortyTime: 4.41 },
    { playerName: 'Domani Jackson',      school: 'Alabama',      position: 'CB',   nflGrade: 5.96, fiqGrade: 80, eliteScore: 70, marketScore: 67, overallPick: 185, draftCap: 63.2, fiqScore: 51.7, fiqTier: 'Tier 4', height: "6'0 3/4\"",  weight: 194, fortyTime: 4.41 },

    // ── IDP — Safety ─────────────────────────────────────────────────────────
    { playerName: 'Caleb Downs',         school: 'Ohio State',   position: 'SAF',  nflGrade: 6.47, fiqGrade: 85, eliteScore: 84, marketScore: 86, overallPick: 11,  draftCap: 98.0, fiqScore: 59.3, fiqTier: 'Tier 2', height: "5'11 5/8\"", weight: 206, fortyTime: 4.48 },
    { playerName: 'Dillon Thieneman',    school: 'Oregon',       position: 'SAF',  nflGrade: 6.37, fiqGrade: 84, eliteScore: 80, marketScore: 81, overallPick: 25,  draftCap: 95.2, fiqScore: 57.3, fiqTier: 'Tier 2', height: "6'0 1/8\"",  weight: 201, fortyTime: 4.35 },
    { playerName: 'Emmanuel McNeil-Warren', school: 'Toledo',    position: 'SAF',  nflGrade: 6.39, fiqGrade: 84, eliteScore: 82, marketScore: 80, overallPick: 58,  draftCap: 88.6, fiqScore: 57.8, fiqTier: 'Tier 2', height: "6'3 1/2\"",  weight: 201, fortyTime: 4.52 },
    { playerName: 'Treydan Stukes',      school: 'Arizona',      position: 'SAF',  nflGrade: 6.27, fiqGrade: 83, eliteScore: 77, marketScore: 76, overallPick: 38,  draftCap: 92.6, fiqScore: 55.6, fiqTier: 'Tier 2', height: "6'0 5/8\"",  weight: 190, fortyTime: 4.33 },
    { playerName: 'A.J. Haulcy',         school: 'LSU',          position: 'SAF',  nflGrade: 6.29, fiqGrade: 83, eliteScore: 84, marketScore: 75, overallPick: 78,  draftCap: 84.6, fiqScore: 57.6, fiqTier: 'Tier 2', height: "5'11 5/8\"", weight: 215, fortyTime: 4.52 },
    { playerName: 'Bud Clark',           school: 'TCU',          position: 'SAF',  nflGrade: 6.28, fiqGrade: 83, eliteScore: 79, marketScore: 73, overallPick: 64,  draftCap: 87.4, fiqScore: 55.9, fiqTier: 'Tier 3', height: "6'0 7/8\"",  weight: 188, fortyTime: 4.41 },
    { playerName: 'Kamari Ramsey',       school: 'USC',          position: 'SAF',  nflGrade: 6.11, fiqGrade: 82, eliteScore: 79, marketScore: 66, overallPick: 129, draftCap: 74.4, fiqScore: 54.9, fiqTier: 'Tier 3', height: "6'0 1/4\"",  weight: 202, fortyTime: 4.47 },
    { playerName: 'Jalon Kilgore',       school: 'South Carolina', position: 'SAF', nflGrade: 6.32, fiqGrade: 84, eliteScore: 74, marketScore: 77, overallPick: 155, draftCap: 69.2, fiqScore: 55.1, fiqTier: 'Tier 3', height: "6'1 3/8\"",  weight: 210, fortyTime: 4.40 },
    { playerName: 'Jakobe Thomas',       school: 'Miami',        position: 'SAF',  nflGrade: 6.12, fiqGrade: 82, eliteScore: 65, marketScore: 67, overallPick: 98,  draftCap: 80.6, fiqScore: 50.8, fiqTier: 'Tier 3', height: "6'1 1/4\"",  weight: 211, fortyTime: 4.57 },
    { playerName: 'Zakee Wheatley',      school: 'Penn State',   position: 'SAF',  nflGrade: 6.15, fiqGrade: 82, eliteScore: 68, marketScore: 68, overallPick: 139, draftCap: 72.4, fiqScore: 51.8, fiqTier: 'Tier 4', height: "6'3 1/8\"",  weight: 203, fortyTime: 4.62 },
    { playerName: 'VJ Payne',            school: 'Kansas State', position: 'SAF',  nflGrade: 6.16, fiqGrade: 82, eliteScore: 69, marketScore: 66, overallPick: 227, draftCap: 54.8, fiqScore: 51.9, fiqTier: 'Tier 4', height: "6'3 1/4\"",  weight: 206, fortyTime: 4.40 },
    { playerName: 'Dalton Johnson',      school: 'Arizona',      position: 'SAF',  nflGrade: 5.93, fiqGrade: 80, eliteScore: 70, marketScore: 64, overallPick: 138, draftCap: 72.6, fiqScore: 51.4, fiqTier: 'Tier 4', height: "5'10 7/8\"", weight: 192, fortyTime: 4.41 },
    { playerName: 'Lorenzo Styles Jr.',  school: 'Ohio State',   position: 'SAF',  nflGrade: 5.69, fiqGrade: 77, eliteScore: 66, marketScore: 69, overallPick: 160, draftCap: 68.2, fiqScore: 49.8, fiqTier: 'Tier 4', height: "6'0 1/2\"",  weight: 194, fortyTime: 4.27 },
    { playerName: 'Robert Spears-Jennings', school: 'Oklahoma',  position: 'SAF',  nflGrade: 5.98, fiqGrade: 80, eliteScore: 69, marketScore: 74, overallPick: 223, draftCap: 55.6, fiqScore: 52.1, fiqTier: 'Tier 4', height: "6'1 7/8\"",  weight: 205, fortyTime: 4.32 },

    // ── K / P ─────────────────────────────────────────────────────────────────
    { playerName: 'Trey Smack',          school: 'Florida',      position: 'K',    nflGrade: 5.92, fiqGrade: 80, eliteScore: 66, marketScore: 68, overallPick: 200, draftCap: 60.2, fiqScore: 50.6, fiqTier: 'Tier 4', height: "6'1 1/4\"",  weight: 188, fortyTime: 4.75 },
    { playerName: 'Tommy Doman Jr.',     school: 'Florida',      position: 'P',    nflGrade: 5.62, fiqGrade: 77, eliteScore: 62, marketScore: 64, overallPick: 238, draftCap: 52.6, fiqScore: 48.1, fiqTier: 'Tier 5', height: "6'4 3/8\"",  weight: 214, fortyTime: 4.75 },
] as const;

async function main() {
    console.log(`\nSeeding ${players.length} rookie rankings players for ${SEASON}...\n`);

    let upserted = 0;
    for (const p of players) {
        // baseFiQScore = scouting score (75%) + draft capital (25%)
        const baseFiQ  = parseFloat((p.fiqScore + p.draftCap * 0.25).toFixed(2));
        const fiqTier  = baseFiQ >= 85 ? 'Tier 1' : baseFiQ >= 78 ? 'Tier 2' : baseFiQ >= 70 ? 'Tier 3' : baseFiQ >= 62 ? 'Tier 4' : 'Tier 5';

        const extra = 'height' in p ? {
            height:    (p as any).height    ?? null,
            weight:    (p as any).weight    ?? null,
            fortyTime: (p as any).fortyTime ?? null,
        } : {};

        await prisma.rookieRankingsPlayer.upsert({
            where:  { season_playerName: { season: SEASON, playerName: p.playerName } },
            update: {
                school:          p.school,
                position:        p.position,
                nflGrade:        p.nflGrade,
                fiqGrade:        p.fiqGrade,
                eliteScore:      p.eliteScore,
                marketScore:     p.marketScore,
                overallPick:     p.overallPick,
                draftCap:        p.draftCap,
                baseFiQScore:    baseFiQ,
                fiqScore:        baseFiQ,
                fiqTier:         fiqTier,
                ...extra,
            },
            create: {
                season:          SEASON,
                playerName:      p.playerName,
                school:          p.school,
                position:        p.position,
                nflGrade:        p.nflGrade,
                fiqGrade:        p.fiqGrade,
                eliteScore:      p.eliteScore,
                marketScore:     p.marketScore,
                overallPick:     p.overallPick,
                draftCap:        p.draftCap,
                baseFiQScore:    baseFiQ,
                opportunityScore: 0,
                fiqScore:        baseFiQ,
                fiqTier:         fiqTier,
                ...extra,
            },
        });
        console.log(`  ✓  ${String(++upserted).padStart(2)}. ${p.position.padEnd(2)}  ${p.playerName.padEnd(28)}  FiQ ${baseFiQ.toFixed(2).padStart(5)}  ${fiqTier}`);
    }

    console.log(`\n✅  Done — ${upserted} players seeded for ${SEASON}.\n`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
