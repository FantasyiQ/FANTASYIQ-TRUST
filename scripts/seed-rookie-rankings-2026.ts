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

// ── 2026 Rookie Rankings Dataset ──────────────────────────────────────────────
// Source: Russell Hansen — FiQ Rookie Rankings Engine v1.0
// Fields: playerName, school, position, nflGrade, fiqGrade, eliteScore,
//         marketScore, overallPick, draftCap, fiqScore, fiqTier

const SEASON = '2026';

const players = [
    // ── Quarterbacks ─────────────────────────────────────────────────────────
    { playerName: 'Fernando Mendoza',  school: 'Indiana',           position: 'QB', nflGrade: 6.73, fiqGrade: 88, eliteScore: 86, marketScore: 79, overallPick: 1,   draftCap: 100,  fiqScore: 90.10, fiqTier: 'Tier 1' },
    { playerName: 'Ty Simpson',        school: 'Alabama',           position: 'QB', nflGrade: 6.30, fiqGrade: 84, eliteScore: 74, marketScore: 73, overallPick: 13,  draftCap: 97.6, fiqScore: 83.98, fiqTier: 'Tier 2' },
    { playerName: 'Carson Beck',       school: 'Miami',             position: 'QB', nflGrade: 6.14, fiqGrade: 82, eliteScore: 74, marketScore: 70, overallPick: 65,  draftCap: 87.2, fiqScore: 79.96, fiqTier: 'Tier 3' },
    { playerName: 'Drew Allar',        school: 'Penn State',        position: 'QB', nflGrade: 5.98, fiqGrade: 80, eliteScore: 72, marketScore: 72, overallPick: 76,  draftCap: 85.0, fiqScore: 78.30, fiqTier: 'Tier 3' },
    { playerName: 'Cade Klubnik',      school: 'Clemson',           position: 'QB', nflGrade: 5.96, fiqGrade: 80, eliteScore: 76, marketScore: 68, overallPick: 110, draftCap: 78.2, fiqScore: 77.06, fiqTier: 'Tier 3' },
    { playerName: 'Taylen Green',      school: 'Arkansas',          position: 'QB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 77, marketScore: 70, overallPick: 182, draftCap: 63.8, fiqScore: 73.54, fiqTier: 'Tier 3' },
    { playerName: 'Cole Payton',       school: 'North Dakota State', position: 'QB', nflGrade: 5.91, fiqGrade: 80, eliteScore: 74, marketScore: 70, overallPick: 178, draftCap: 64.6, fiqScore: 72.58, fiqTier: 'Tier 3' },
    { playerName: 'Garrett Nussmeier', school: 'LSU',               position: 'QB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 70, marketScore: 68, overallPick: 249, draftCap: 50.4, fiqScore: 67.22, fiqTier: 'Tier 4' },
    { playerName: 'Behren Morton',     school: 'Texas Tech',        position: 'QB', nflGrade: 5.68, fiqGrade: 77, eliteScore: 69, marketScore: 68, overallPick: 234, draftCap: 53.4, fiqScore: 66.62, fiqTier: 'Tier 4' },
    { playerName: 'Diego Pavia',       school: 'Vanderbilt',        position: 'QB', nflGrade: 5.95, fiqGrade: 80, eliteScore: 71, marketScore: 69, overallPick: 261, draftCap: 48.0, fiqScore: 66.60, fiqTier: 'Tier 4' },
    { playerName: 'Haynes King',       school: 'Georgia Tech',      position: 'QB', nflGrade: 5.80, fiqGrade: 79, eliteScore: 72, marketScore: 66, overallPick: 261, draftCap: 48.0, fiqScore: 66.30, fiqTier: 'Tier 4' },
    { playerName: 'Athan Kaliakmanis', school: 'Rutgers',           position: 'QB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 64, marketScore: 62, overallPick: 223, draftCap: 55.6, fiqScore: 65.18, fiqTier: 'Tier 4' },
    { playerName: 'Jalon Daniels',     school: 'Kansas',            position: 'QB', nflGrade: 5.66, fiqGrade: 77, eliteScore: 68, marketScore: 69, overallPick: 261, draftCap: 48.0, fiqScore: 64.80, fiqTier: 'Tier 4' },
    { playerName: 'Joey Aguilar',      school: 'Tennessee',         position: 'QB', nflGrade: 5.95, fiqGrade: 80, eliteScore: 72, marketScore: 68, overallPick: 300, draftCap: 40.2, fiqScore: 64.46, fiqTier: 'Tier 4' },
    { playerName: 'Sawyer Robertson',  school: 'Baylor',            position: 'QB', nflGrade: 5.85, fiqGrade: 79, eliteScore: 67, marketScore: 67, overallPick: 300, draftCap: 40.2, fiqScore: 62.56, fiqTier: 'Tier 4' },
    { playerName: 'Joe Fagnano',       school: 'Connecticut',       position: 'QB', nflGrade: 5.66, fiqGrade: 77, eliteScore: 69, marketScore: 67, overallPick: 300, draftCap: 40.2, fiqScore: 62.56, fiqTier: 'Tier 4' },
    { playerName: 'Luke Altmyer',      school: 'Illinois',          position: 'QB', nflGrade: 5.68, fiqGrade: 77, eliteScore: 64, marketScore: 68, overallPick: 300, draftCap: 40.2, fiqScore: 61.16, fiqTier: 'Tier 4' },

    // ── Running Backs ─────────────────────────────────────────────────────────
    { playerName: 'Jeremiyah Love',    school: 'Notre Dame',        position: 'RB', nflGrade: 6.73, fiqGrade: 88, eliteScore: 96, marketScore: 89, overallPick: 3,   draftCap: 99.6, fiqScore: 93.98, fiqTier: 'Tier 1' },
    { playerName: 'Jadarian Price',    school: 'Notre Dame',        position: 'RB', nflGrade: 6.38, fiqGrade: 84, eliteScore: 75, marketScore: 80, overallPick: 32,  draftCap: 93.8, fiqScore: 83.84, fiqTier: 'Tier 2' },
    { playerName: 'Jonah Coleman',     school: 'Washington',        position: 'RB', nflGrade: 5.94, fiqGrade: 80, eliteScore: 77, marketScore: 74, overallPick: 108, draftCap: 78.6, fiqScore: 78.08, fiqTier: 'Tier 3' },
    { playerName: 'Mike Washington Jr', school: 'Arkansas',         position: 'RB', nflGrade: 6.24, fiqGrade: 83, eliteScore: 70, marketScore: 76, overallPick: 122, draftCap: 75.8, fiqScore: 76.24, fiqTier: 'Tier 3' },
    { playerName: 'Nicholas Singleton', school: 'Penn State',       position: 'RB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 78, marketScore: 78, overallPick: 165, draftCap: 67.2, fiqScore: 75.66, fiqTier: 'Tier 3' },
    { playerName: 'Emmett Johnson',    school: 'Nebraska',          position: 'RB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 73, marketScore: 79, overallPick: 161, draftCap: 68.0, fiqScore: 74.50, fiqTier: 'Tier 3' },
    { playerName: 'Adam Randall',      school: 'Clemson',           position: 'RB', nflGrade: 6.13, fiqGrade: 82, eliteScore: 74, marketScore: 74, overallPick: 166, draftCap: 67.0, fiqScore: 74.30, fiqTier: 'Tier 3' },
    { playerName: 'Kaelon Black',      school: 'Indiana',           position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 62, marketScore: 70, overallPick: 90,  draftCap: 82.2, fiqScore: 73.36, fiqTier: 'Tier 3' },
    { playerName: 'Kaytron Allen',     school: 'Penn State',        position: 'RB', nflGrade: 5.97, fiqGrade: 80, eliteScore: 69, marketScore: 80, overallPick: 187, draftCap: 62.8, fiqScore: 71.54, fiqTier: 'Tier 3' },
    { playerName: 'Demond Claiborne',  school: 'Wake Forest',       position: 'RB', nflGrade: 6.10, fiqGrade: 82, eliteScore: 67, marketScore: 70, overallPick: 198, draftCap: 60.6, fiqScore: 69.88, fiqTier: 'Tier 4' },
    { playerName: 'Eli Heidenreich',   school: 'Navy',              position: 'RB', nflGrade: 5.86, fiqGrade: 79, eliteScore: 73, marketScore: 67, overallPick: 230, draftCap: 54.2, fiqScore: 68.56, fiqTier: 'Tier 4' },
    { playerName: 'Seth McGowan',      school: 'Kentucky',          position: 'RB', nflGrade: 5.97, fiqGrade: 80, eliteScore: 69, marketScore: 65, overallPick: 237, draftCap: 52.8, fiqScore: 67.04, fiqTier: 'Tier 4' },
    { playerName: 'CJ Donaldson',      school: 'West Virginia',     position: 'RB', nflGrade: 5.82, fiqGrade: 79, eliteScore: 63, marketScore: 79, overallPick: 262, draftCap: 47.8, fiqScore: 64.84, fiqTier: 'Tier 4' },
    { playerName: 'Jam Miller',        school: 'Alabama',           position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 59, marketScore: 66, overallPick: 245, draftCap: 51.2, fiqScore: 62.76, fiqTier: 'Tier 4' },
    { playerName: "Le'Veon Moss",      school: 'Texas A&M',         position: 'RB', nflGrade: 6.10, fiqGrade: 82, eliteScore: 55, marketScore: 68, overallPick: 261, draftCap: 48.0, fiqScore: 62.30, fiqTier: 'Tier 4' },
    { playerName: 'Dean Connors',      school: 'Rice',              position: 'RB', nflGrade: 5.67, fiqGrade: 77, eliteScore: 68, marketScore: 64, overallPick: 295, draftCap: 41.2, fiqScore: 62.26, fiqTier: 'Tier 4' },
    { playerName: "J'Mari Taylor",     school: 'Memphis',           position: 'RB', nflGrade: 5.99, fiqGrade: 80, eliteScore: 65, marketScore: 64, overallPick: 300, draftCap: 40.2, fiqScore: 61.96, fiqTier: 'Tier 4' },
    { playerName: 'Chip Trayanum',     school: 'Ohio State',        position: 'RB', nflGrade: 5.85, fiqGrade: 79, eliteScore: 60, marketScore: 55, overallPick: 261, draftCap: 48.0, fiqScore: 61.60, fiqTier: 'Tier 4' },
    { playerName: 'Rahsul Faison',     school: 'Coastal Carolina',  position: 'RB', nflGrade: 6.00, fiqGrade: 81, eliteScore: 61, marketScore: 65, overallPick: 300, draftCap: 40.2, fiqScore: 61.16, fiqTier: 'Tier 4' },
    { playerName: 'Noah Whittington',  school: 'Oregon',            position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 58, marketScore: 66, overallPick: 270, draftCap: 46.2, fiqScore: 60.96, fiqTier: 'Tier 4' },
    { playerName: 'Jaydn Ott',         school: 'Cal',               position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 60, marketScore: 60, overallPick: 280, draftCap: 44.2, fiqScore: 60.36, fiqTier: 'Tier 4' },
    { playerName: 'Roman Hemby',       school: 'Maryland',          position: 'RB', nflGrade: 5.98, fiqGrade: 80, eliteScore: 58, marketScore: 66, overallPick: 300, draftCap: 40.2, fiqScore: 60.06, fiqTier: 'Tier 4' },
    { playerName: 'Jamal Haynes',      school: 'Georgia Tech',      position: 'RB', nflGrade: 5.65, fiqGrade: 77, eliteScore: 60, marketScore: 64, overallPick: 300, draftCap: 40.2, fiqScore: 59.56, fiqTier: 'Tier 5' },
    { playerName: 'Sam Scott',         school: 'Wyoming',           position: 'RB', nflGrade: 5.65, fiqGrade: 77, eliteScore: 60, marketScore: 63, overallPick: 300, draftCap: 40.2, fiqScore: 59.46, fiqTier: 'Tier 5' },
    { playerName: 'Barika Kpeenu',     school: 'North Dakota State', position: 'RB', nflGrade: 5.68, fiqGrade: 77, eliteScore: 60, marketScore: 56, overallPick: 297, draftCap: 40.8, fiqScore: 58.94, fiqTier: 'Tier 5' },
    { playerName: 'Davon Booth',       school: 'Utah State',        position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 60, marketScore: 55, overallPick: 298, draftCap: 40.6, fiqScore: 58.78, fiqTier: 'Tier 5' },
    { playerName: 'Al-Jay Henderson',  school: 'Coastal Carolina',  position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 60, marketScore: 55, overallPick: 299, draftCap: 40.4, fiqScore: 58.72, fiqTier: 'Tier 5' },
    { playerName: 'Robert Henry Jr',   school: 'New Mexico State',  position: 'RB', nflGrade: 5.69, fiqGrade: 77, eliteScore: 57, marketScore: 58, overallPick: 296, draftCap: 41.0, fiqScore: 58.30, fiqTier: 'Tier 5' },
    { playerName: 'Kentrel Bullock',   school: 'South Alabama',     position: 'RB', nflGrade: 5.67, fiqGrade: 77, eliteScore: 56, marketScore: 56, overallPick: 296, draftCap: 41.0, fiqScore: 57.80, fiqTier: 'Tier 5' },
    { playerName: 'Desmond Reid',      school: 'Western Carolina',  position: 'RB', nflGrade: 5.92, fiqGrade: 80, eliteScore: 68, marketScore: 0,  overallPick: 300, draftCap: 40.2, fiqScore: 56.46, fiqTier: 'Tier 5' },

    // ── Wide Receivers ────────────────────────────────────────────────────────
    { playerName: 'Jordyn Tyson',           school: 'Arizona State',     position: 'WR', nflGrade: 85, fiqGrade: 86, eliteScore: 84, marketScore: 0, overallPick: 8,   draftCap: 98.6, fiqScore: 89.28, fiqTier: 'Tier 2' },
    { playerName: 'Carnell Tate',           school: 'Ohio State',        position: 'WR', nflGrade: 88, fiqGrade: 77, eliteScore: 82, marketScore: 0, overallPick: 4,   draftCap: 99.4, fiqScore: 87.52, fiqTier: 'Tier 2' },
    { playerName: 'Makai Lemon',            school: 'USC',               position: 'WR', nflGrade: 85, fiqGrade: 83, eliteScore: 80, marketScore: 0, overallPick: 20,  draftCap: 96.2, fiqScore: 87.26, fiqTier: 'Tier 2' },
    { playerName: 'Omar Cooper Jr.',        school: 'Indiana',           position: 'WR', nflGrade: 84, fiqGrade: 79, eliteScore: 81, marketScore: 0, overallPick: 30,  draftCap: 94.2, fiqScore: 85.26, fiqTier: 'Tier 2' },
    { playerName: 'KC Concepcion',          school: 'Texas A&M',         position: 'WR', nflGrade: 85, fiqGrade: 77, eliteScore: 77, marketScore: 0, overallPick: 24,  draftCap: 95.4, fiqScore: 84.92, fiqTier: 'Tier 2' },
    { playerName: 'Denzel Boston',          school: 'Washington',        position: 'WR', nflGrade: 85, fiqGrade: 78, eliteScore: 79, marketScore: 0, overallPick: 39,  draftCap: 92.4, fiqScore: 84.52, fiqTier: 'Tier 2' },
    { playerName: "De'Zhaun Stribling",     school: 'Mississippi',       position: 'WR', nflGrade: 83, fiqGrade: 76, eliteScore: 78, marketScore: 0, overallPick: 33,  draftCap: 93.6, fiqScore: 83.58, fiqTier: 'Tier 2' },
    { playerName: 'Germie Bernard',         school: 'Alabama',           position: 'WR', nflGrade: 83, fiqGrade: 75, eliteScore: 73, marketScore: 0, overallPick: 47,  draftCap: 90.8, fiqScore: 81.94, fiqTier: 'Tier 2' },
    { playerName: 'Zachariah Branch',       school: 'Georgia',           position: 'WR', nflGrade: 84, fiqGrade: 79, eliteScore: 76, marketScore: 0, overallPick: 79,  draftCap: 84.4, fiqScore: 81.82, fiqTier: 'Tier 2' },
    { playerName: 'Chris Brazzell II',      school: 'Tennessee',         position: 'WR', nflGrade: 84, fiqGrade: 78, eliteScore: 77, marketScore: 0, overallPick: 83,  draftCap: 83.6, fiqScore: 81.38, fiqTier: 'Tier 2' },
    { playerName: 'Antonio Williams',       school: 'Clemson',           position: 'WR', nflGrade: 83, fiqGrade: 75, eliteScore: 74, marketScore: 0, overallPick: 71,  draftCap: 86.0, fiqScore: 80.60, fiqTier: 'Tier 2' },
    { playerName: 'Malachi Fields',         school: 'Notre Dame',        position: 'WR', nflGrade: 83, fiqGrade: 74, eliteScore: 77, marketScore: 0, overallPick: 74,  draftCap: 85.4, fiqScore: 80.42, fiqTier: 'Tier 2' },
    { playerName: 'Chris Bell',             school: 'Louisville',        position: 'WR', nflGrade: 83, fiqGrade: 79, eliteScore: 73, marketScore: 0, overallPick: 94,  draftCap: 81.4, fiqScore: 80.32, fiqTier: 'Tier 2' },
    { playerName: "Ja'Kobi Lane",           school: 'USC',               position: 'WR', nflGrade: 83, fiqGrade: 75, eliteScore: 76, marketScore: 0, overallPick: 80,  draftCap: 84.2, fiqScore: 80.26, fiqTier: 'Tier 2' },
    { playerName: 'Ted Hurst',              school: 'Georgia State',     position: 'WR', nflGrade: 82, fiqGrade: 76, eliteScore: 74, marketScore: 0, overallPick: 84,  draftCap: 83.4, fiqScore: 79.82, fiqTier: 'Tier 3' },
    { playerName: 'Bryce Lance',            school: 'North Dakota State', position: 'WR', nflGrade: 82, fiqGrade: 86, eliteScore: 70, marketScore: 0, overallPick: 132, draftCap: 73.8, fiqScore: 79.54, fiqTier: 'Tier 3' },
    { playerName: 'Elijah Sarratt',         school: 'Indiana',           position: 'WR', nflGrade: 82, fiqGrade: 78, eliteScore: 76, marketScore: 0, overallPick: 111, draftCap: 78.0, fiqScore: 79.00, fiqTier: 'Tier 3' },
    { playerName: 'Skyler Bell',            school: 'Connecticut',       position: 'WR', nflGrade: 84, fiqGrade: 78, eliteScore: 75, marketScore: 0, overallPick: 125, draftCap: 75.2, fiqScore: 78.66, fiqTier: 'Tier 3' },
    { playerName: 'Caleb Douglas',          school: 'Texas Tech',        position: 'WR', nflGrade: 80, fiqGrade: 73, eliteScore: 60, marketScore: 0, overallPick: 74,  draftCap: 85.4, fiqScore: 77.52, fiqTier: 'Tier 3' },
    { playerName: 'Brenen Thompson',        school: 'Mississippi State', position: 'WR', nflGrade: 79, fiqGrade: 77, eliteScore: 58, marketScore: 0, overallPick: 101, draftCap: 80.0, fiqScore: 76.60, fiqTier: 'Tier 3' },
    { playerName: 'Zavion Thomas',          school: 'LSU',               position: 'WR', nflGrade: 79, fiqGrade: 69, eliteScore: 62, marketScore: 0, overallPick: 89,  draftCap: 82.4, fiqScore: 75.32, fiqTier: 'Tier 3' },
    { playerName: 'Colbie Young',           school: 'Georgia',           position: 'WR', nflGrade: 80, fiqGrade: 70, eliteScore: 66, marketScore: 0, overallPick: 136, draftCap: 73.0, fiqScore: 73.50, fiqTier: 'Tier 3' },
    { playerName: 'Kendrick Law',           school: 'Kentucky',          position: 'WR', nflGrade: 80, fiqGrade: 70, eliteScore: 59, marketScore: 0, overallPick: 160, draftCap: 68.2, fiqScore: 71.36, fiqTier: 'Tier 3' },
    { playerName: 'Reggie Virgil',          school: 'Texas Tech',        position: 'WR', nflGrade: 80, fiqGrade: 64, eliteScore: 59, marketScore: 0, overallPick: 131, draftCap: 74.0, fiqScore: 71.30, fiqTier: 'Tier 3' },
    { playerName: 'Deion Burks',            school: 'Oklahoma',          position: 'WR', nflGrade: 82, fiqGrade: 76, eliteScore: 71, marketScore: 0, overallPick: 225, draftCap: 55.2, fiqScore: 71.06, fiqTier: 'Tier 3' },
    { playerName: 'Kaden Wetjen',           school: 'Iowa',              position: 'WR', nflGrade: 80, fiqGrade: 61, eliteScore: 59, marketScore: 0, overallPick: 121, draftCap: 76.0, fiqScore: 71.00, fiqTier: 'Tier 3' },
    { playerName: 'Barion Brown',           school: 'LSU',               position: 'WR', nflGrade: 79, fiqGrade: 72, eliteScore: 61, marketScore: 0, overallPick: 177, draftCap: 64.8, fiqScore: 70.84, fiqTier: 'Tier 3' },
    { playerName: 'Josh Cameron',           school: 'Baylor',            position: 'WR', nflGrade: 81, fiqGrade: 70, eliteScore: 60, marketScore: 0, overallPick: 178, draftCap: 64.6, fiqScore: 70.68, fiqTier: 'Tier 3' },
    { playerName: 'Malik Benson',           school: 'Oregon',            position: 'WR', nflGrade: 81, fiqGrade: 68, eliteScore: 68, marketScore: 0, overallPick: 182, draftCap: 63.8, fiqScore: 70.64, fiqTier: 'Tier 3' },
    { playerName: 'CJ Daniels',             school: 'Miami',             position: 'WR', nflGrade: 79, fiqGrade: 72, eliteScore: 58, marketScore: 0, overallPick: 184, draftCap: 63.4, fiqScore: 70.12, fiqTier: 'Tier 3' },
    { playerName: 'Kevin Coleman Jr.',      school: 'Missouri',          position: 'WR', nflGrade: 80, fiqGrade: 66, eliteScore: 59, marketScore: 0, overallPick: 169, draftCap: 66.4, fiqScore: 69.62, fiqTier: 'Tier 4' },
    { playerName: 'Jeff Caldwell',          school: 'Cincinnati',        position: 'WR', nflGrade: 81, fiqGrade: 78, eliteScore: 60, marketScore: 0, overallPick: 261, draftCap: 48.0, fiqScore: 68.10, fiqTier: 'Tier 4' },
    { playerName: 'Emmanuel Henderson Jr.', school: 'Kansas',            position: 'WR', nflGrade: 79, fiqGrade: 63, eliteScore: 58, marketScore: 0, overallPick: 186, draftCap: 63.0, fiqScore: 67.30, fiqTier: 'Tier 4' },
    { playerName: 'J. Michael Sturdivant',  school: 'Florida',           position: 'WR', nflGrade: 82, fiqGrade: 71, eliteScore: 64, marketScore: 0, overallPick: 261, draftCap: 48.0, fiqScore: 66.70, fiqTier: 'Tier 4' },
    { playerName: 'Dillon Bell',            school: 'Georgia',           position: 'WR', nflGrade: 80, fiqGrade: 70, eliteScore: 59, marketScore: 0, overallPick: 261, draftCap: 48.0, fiqScore: 65.30, fiqTier: 'Tier 4' },
    { playerName: 'Eric McAlister',         school: 'TCU',               position: 'WR', nflGrade: 80, fiqGrade: 68, eliteScore: 59, marketScore: 0, overallPick: 261, draftCap: 48.0, fiqScore: 64.70, fiqTier: 'Tier 4' },

    // ── Tight Ends ────────────────────────────────────────────────────────────
    { playerName: 'Kenyon Sadiq',       school: 'Oregon',       position: 'TE', nflGrade: 85, fiqGrade: 93, eliteScore: 84, marketScore: 0, overallPick: 16,  draftCap: 97.0,  fiqScore: 90.90, fiqTier: 'Tier 1' },
    { playerName: 'Eli Stowers',        school: 'Vanderbilt',   position: 'TE', nflGrade: 83, fiqGrade: 85, eliteScore: 80, marketScore: 0, overallPick: 54,  draftCap: 89.4,  fiqScore: 85.22, fiqTier: 'Tier 2' },
    { playerName: 'Max Klare',          school: 'Ohio State',   position: 'TE', nflGrade: 84, fiqGrade: 76, eliteScore: 78, marketScore: 0, overallPick: 61,  draftCap: 88.0,  fiqScore: 82.20, fiqTier: 'Tier 2' },
    { playerName: 'Oscar Delp',         school: 'Georgia',      position: 'TE', nflGrade: 82, fiqGrade: 76, eliteScore: 76, marketScore: 0, overallPick: 73,  draftCap: 85.6,  fiqScore: 80.68, fiqTier: 'Tier 2' },
    { playerName: 'Sam Roush',          school: 'Stanford',     position: 'TE', nflGrade: 83, fiqGrade: 74, eliteScore: 71, marketScore: 0, overallPick: 69,  draftCap: 86.4,  fiqScore: 80.12, fiqTier: 'Tier 2' },
    { playerName: 'Marlin Klein',       school: 'Michigan',     position: 'TE', nflGrade: 82, fiqGrade: 65, eliteScore: 71, marketScore: 0, overallPick: 59,  draftCap: 88.4,  fiqScore: 77.72, fiqTier: 'Tier 3' },
    { playerName: 'Eli Raridon',        school: 'Notre Dame',   position: 'TE', nflGrade: 82, fiqGrade: 70, eliteScore: 73, marketScore: 0, overallPick: 95,  draftCap: 81.2,  fiqScore: 77.26, fiqTier: 'Tier 3' },
    { playerName: 'Nate Boerkircher',   school: 'Texas A&M',    position: 'TE', nflGrade: 82, fiqGrade: 71, eliteScore: 47, marketScore: 0, overallPick: 56,  draftCap: 89.0,  fiqScore: 77.30, fiqTier: 'Tier 3' },
    { playerName: 'Will Kacmarek',      school: 'Ohio State',   position: 'TE', nflGrade: 82, fiqGrade: 66, eliteScore: 66, marketScore: 0, overallPick: 87,  draftCap: 82.8,  fiqScore: 75.84, fiqTier: 'Tier 3' },
    { playerName: 'Matthew Hibner',     school: 'SMU',          position: 'TE', nflGrade: 80, fiqGrade: 69, eliteScore: 64, marketScore: 0, overallPick: 129, draftCap: 74.4,  fiqScore: 73.42, fiqTier: 'Tier 3' },
    { playerName: 'Justin Joly',        school: 'NC State',     position: 'TE', nflGrade: 82, fiqGrade: 71, eliteScore: 61, marketScore: 0, overallPick: 140, draftCap: 72.2,  fiqScore: 73.66, fiqTier: 'Tier 3' },
    { playerName: 'Tanner Koziol',      school: 'Houston',      position: 'TE', nflGrade: 80, fiqGrade: 70, eliteScore: 52, marketScore: 0, overallPick: 152, draftCap: 69.8,  fiqScore: 71.14, fiqTier: 'Tier 3' },
    { playerName: 'Jack Endries',       school: 'Texas',        position: 'TE', nflGrade: 82, fiqGrade: 71, eliteScore: 66, marketScore: 0, overallPick: 197, draftCap: 60.8,  fiqScore: 70.74, fiqTier: 'Tier 3' },
    { playerName: 'Josh Cuevas',        school: 'Alabama',      position: 'TE', nflGrade: 80, fiqGrade: 68, eliteScore: 62, marketScore: 0, overallPick: 168, draftCap: 66.6,  fiqScore: 70.58, fiqTier: 'Tier 3' },
    { playerName: 'Bauer Sharp',        school: 'LSU',          position: 'TE', nflGrade: 77, fiqGrade: 74, eliteScore: 40, marketScore: 0, overallPick: 164, draftCap: 67.4,  fiqScore: 69.52, fiqTier: 'Tier 4' },
    { playerName: 'Dallen Bentley',     school: 'Utah',         position: 'TE', nflGrade: 79, fiqGrade: 77, eliteScore: 62, marketScore: 0, overallPick: 232, draftCap: 53.8,  fiqScore: 69.14, fiqTier: 'Tier 4' },
    { playerName: 'Riley Nowakowski',   school: 'Indiana',      position: 'TE', nflGrade: 82, fiqGrade: 63, eliteScore: 61, marketScore: 0, overallPick: 165, draftCap: 67.2,  fiqScore: 69.76, fiqTier: 'Tier 4' },
    { playerName: 'Joe Royer',          school: 'Cincinnati',   position: 'TE', nflGrade: 82, fiqGrade: 68, eliteScore: 46, marketScore: 0, overallPick: 166, draftCap: 67.0,  fiqScore: 69.70, fiqTier: 'Tier 4' },
    { playerName: 'Jaren Kanak',        school: 'Oklahoma',     position: 'TE', nflGrade: 79, fiqGrade: 64, eliteScore: 66, marketScore: 0, overallPick: 201, draftCap: 60.0,  fiqScore: 67.50, fiqTier: 'Tier 4' },
] as const;

async function main() {
    console.log(`\nSeeding ${players.length} rookie rankings players for ${SEASON}...\n`);

    let upserted = 0;
    for (const p of players) {
        await prisma.rookieRankingsPlayer.upsert({
            where:  { season_playerName: { season: SEASON, playerName: p.playerName } },
            update: {
                school:      p.school,
                position:    p.position,
                nflGrade:    p.nflGrade,
                fiqGrade:    p.fiqGrade,
                eliteScore:  p.eliteScore,
                marketScore: p.marketScore,
                overallPick: p.overallPick,
                draftCap:    p.draftCap,
                fiqScore:    p.fiqScore,
                fiqTier:     p.fiqTier,
            },
            create: {
                season:      SEASON,
                playerName:  p.playerName,
                school:      p.school,
                position:    p.position,
                nflGrade:    p.nflGrade,
                fiqGrade:    p.fiqGrade,
                eliteScore:  p.eliteScore,
                marketScore: p.marketScore,
                overallPick: p.overallPick,
                draftCap:    p.draftCap,
                fiqScore:    p.fiqScore,
                fiqTier:     p.fiqTier,
            },
        });
        console.log(`  ✓  ${String(++upserted).padStart(2)}. ${p.position.padEnd(2)}  ${p.playerName.padEnd(28)}  FiQ ${p.fiqScore.toFixed(2).padStart(5)}  ${p.fiqTier}`);
    }

    console.log(`\n✅  Done — ${upserted} players seeded for ${SEASON}.\n`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
