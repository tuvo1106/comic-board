/**
 * Seed the board from the real cover images in ./images. Metadata is
 * hand-authored (best-effort — refine any of it via the in-app Edit button).
 *
 * Run with `npm run db:seed`. Clears existing data first so it can be re-run.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./client";
import {
  artists,
  authors,
  boardComics,
  boards,
  characters,
  comicArtists,
  comicAuthors,
  comicCharacters,
  comicTags,
  comics,
  tags,
} from "./schema";
import { COVERS_ROOT } from "@/lib/storage";
import { processUpload } from "@/lib/images";
import { addComicToBoard, createBoard, createComic } from "./queries";

const IMAGES_DIR = path.join(process.cwd(), "images");

interface RealCover {
  file: string;
  series: string;
  issue: string;
  publisher: string;
  date: string; // yyyy-mm-dd
  authors: string[];
  artists: string[]; // cover artists
  characters: string[];
  tags: string[];
  boards: string[]; // board names to add to
}

const REAL: RealCover[] = [
  // --- Classics / facsimiles ---
  {
    file: "amazing-spider-man-14-a.jpg",
    series: "The Amazing Spider-Man",
    issue: "14",
    publisher: "Marvel",
    date: "1964-07-10",
    authors: ["Stan Lee"],
    artists: ["Steve Ditko"],
    characters: ["Spider-Man", "Green Goblin", "Hulk"],
    tags: ["Facsimile", "Key Issue"],
    boards: ["Vintage Vault"],
  },
  {
    file: "batman-156-a.jpg",
    series: "Batman",
    issue: "156",
    publisher: "DC",
    date: "1963-06-01",
    authors: ["Bill Finger"],
    artists: ["Sheldon Moldoff"],
    characters: ["Batman", "Robin"],
    tags: ["Facsimile"],
    boards: ["Vintage Vault"],
  },
  {
    file: "showcase-4-a.jpg",
    series: "Showcase",
    issue: "4",
    publisher: "DC",
    date: "1956-10-01",
    authors: ["Robert Kanigher"],
    artists: ["Carmine Infantino"],
    characters: ["The Flash"],
    tags: ["Facsimile", "Key Issue"],
    boards: ["Vintage Vault"],
  },
  {
    file: "detective-comics-359-a.jpg",
    series: "Detective Comics",
    issue: "359",
    publisher: "DC",
    date: "1967-01-01",
    authors: ["Gardner Fox"],
    artists: ["Carmine Infantino"],
    characters: ["Batgirl", "Batman"],
    tags: ["Facsimile", "Key Issue"],
    boards: ["Vintage Vault"],
  },
  {
    file: "silver-surfer-4.jpg",
    series: "Silver Surfer",
    issue: "4",
    publisher: "Marvel",
    date: "1969-02-01",
    authors: ["Stan Lee"],
    artists: ["John Buscema"],
    characters: ["Silver Surfer", "Thor", "Loki"],
    tags: ["Facsimile", "Key Issue"],
    boards: ["Vintage Vault"],
  },
  {
    file: "green-lantern-49-a.jpg",
    series: "Green Lantern",
    issue: "49",
    publisher: "DC",
    date: "1994-02-01",
    authors: ["Ron Marz"],
    artists: ["Darryl Banks", "Romeo Tanghal"],
    characters: ["Hal Jordan"],
    tags: ["Key Issue"],
    boards: ["Vintage Vault"],
  },
  // --- Current DC "All In" era ---
  {
    file: "absolute-batman-21-a.jpg",
    series: "Absolute Batman",
    issue: "21",
    publisher: "DC",
    date: "2025-10-01",
    authors: ["Scott Snyder"],
    artists: ["Nick Dragotta"],
    characters: ["Batman"],
    tags: [],
    boards: ["All In"],
  },
  {
    file: "absolute-batman-22-a.jpg",
    series: "Absolute Batman",
    issue: "22",
    publisher: "DC",
    date: "2025-11-05",
    authors: ["Scott Snyder"],
    artists: ["Nick Dragotta"],
    characters: ["Batman", "Joker", "Bane"],
    tags: [],
    boards: ["All In"],
  },
  {
    file: "absolute-catwoman-1-a.jpg",
    series: "Absolute Catwoman",
    issue: "1",
    publisher: "DC",
    date: "2025-01-01",
    authors: ["Jeff Lemire"],
    artists: ["Nick Robles"],
    characters: ["Catwoman"],
    tags: ["Key Issue"],
    boards: ["All In"],
  },
  {
    file: "poison-ivy-46-cc.jpg",
    series: "Poison Ivy",
    issue: "46",
    publisher: "DC",
    date: "2025-01-08",
    authors: ["G. Willow Wilson"],
    artists: [],
    characters: ["Poison Ivy"],
    tags: ["Variant"],
    boards: ["All In"],
  },
  // --- Modern DC ---
  {
    file: "batwoman-4-c.jpg",
    series: "Batwoman",
    issue: "4",
    publisher: "DC",
    date: "2025-05-01",
    authors: [],
    artists: [],
    characters: ["Batwoman"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "barbara-gordon-breakout-2-b.jpg",
    series: "Barbara Gordon: Breakout",
    issue: "2",
    publisher: "DC",
    date: "2025-07-01",
    authors: [],
    artists: [],
    characters: ["Barbara Gordon"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "batman-gargoyle-of-gotham-4-c.jpg",
    series: "Batman: The Gargoyle of Gotham",
    issue: "4",
    publisher: "DC",
    date: "2024-06-01",
    authors: ["Rafael Grampá"],
    artists: ["Rafael Grampá"],
    characters: ["Batman"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "zatanna-3-c.jpg",
    series: "Zatanna",
    issue: "3",
    publisher: "DC",
    date: "2025-06-01",
    authors: [],
    artists: [],
    characters: ["Zatanna"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "justice-league-unlimited-20-f.jpg",
    series: "Justice League Unlimited",
    issue: "20",
    publisher: "DC",
    date: "2025-08-01",
    authors: ["Mark Waid"],
    artists: [],
    characters: ["Justice League"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "supergirl-and-the-legion-of-super-heroes-23-a.jpg",
    series: "Supergirl and the Legion of Super-Heroes",
    issue: "23",
    publisher: "DC",
    date: "2006-12-01",
    authors: ["Mark Waid"],
    artists: ["Barry Kitson"],
    characters: ["Supergirl"],
    tags: [],
    boards: [],
  },
  // --- Marvel ---
  {
    file: "daredevil-4-a.jpg",
    series: "Daredevil",
    issue: "4",
    publisher: "Marvel",
    date: "2024-01-17",
    authors: ["Saladin Ahmed"],
    artists: ["Lee Garbett"],
    characters: ["Daredevil"],
    tags: [],
    boards: [],
  },
  {
    file: "magic-and-colossus-5-b.jpg",
    series: "Magik and Colossus",
    issue: "5",
    publisher: "Marvel",
    date: "2025-09-01",
    authors: [],
    artists: [],
    characters: ["Magik", "Colossus"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "xmen-united-5-b.jpg",
    series: "X-Men United",
    issue: "5",
    publisher: "Marvel",
    date: "2026-04-15",
    authors: [],
    artists: ["David Nakayama"],
    characters: ["Psylocke"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "xmen-outback-1-c.jpg",
    series: "X-Men: Outback",
    issue: "1",
    publisher: "Marvel",
    date: "2025-03-01",
    authors: [],
    artists: [],
    characters: ["Storm", "Wolverine"],
    tags: ["Variant"],
    boards: [],
  },
  // --- Indie ---
  {
    file: "siktc-48-c.jpg",
    series: "Something is Killing the Children",
    issue: "48",
    publisher: "BOOM! Studios",
    date: "2025-02-01",
    authors: ["James Tynion IV"],
    artists: ["Werther Dell'Edera"],
    characters: ["Erica Slaughter"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "rook-exodus-10-a.jpg",
    series: "Rook: Exodus",
    issue: "10",
    publisher: "Image",
    date: "2025-07-01",
    authors: ["Geoff Johns"],
    artists: ["Jason Fabok"],
    characters: ["Rook"],
    tags: [],
    boards: [],
  },
  {
    file: "assorted-crisis-events-9-c.jpg",
    series: "Assorted Crisis Events",
    issue: "9",
    publisher: "Image",
    date: "2025-08-01",
    authors: ["Deniz Camp"],
    artists: ["Eric Zawadzki"],
    characters: [],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "gun-honey-doubles-down-1-j.jpg",
    series: "Gun Honey: Doubles Down",
    issue: "1",
    publisher: "Titan Comics",
    date: "2023-03-01",
    authors: ["Charles Ardai"],
    artists: [],
    characters: ["Gun Honey"],
    tags: ["Variant"],
    boards: [],
  },
  {
    file: "dingoliath-1-b.jpg",
    series: "Dingoliath",
    issue: "1",
    publisher: "Bad Idea",
    date: "2024-06-12",
    authors: ["Robert Venditti", "Brockton McKinney"],
    artists: ["Manix Abrera"],
    characters: ["Dingoliath"],
    tags: ["Homage", "Variant"],
    boards: [],
  },
];

async function clearAll() {
  db.delete(comicAuthors).run();
  db.delete(comicArtists).run();
  db.delete(comicCharacters).run();
  db.delete(comicTags).run();
  db.delete(boardComics).run();
  db.delete(comics).run();
  db.delete(boards).run();
  db.delete(authors).run();
  db.delete(artists).run();
  db.delete(characters).run();
  db.delete(tags).run();
  await fs.rm(COVERS_ROOT, { recursive: true, force: true });
}

async function main() {
  await clearAll();

  const boardIds = new Map<string, string>();
  for (const name of ["Vintage Vault", "All In"]) {
    boardIds.set(name, createBoard(name).id);
  }

  let count = 0;
  for (const rc of REAL) {
    const buf = await fs.readFile(path.join(IMAGES_DIR, rc.file));
    const image = await processUpload(buf);
    const comic = createComic({
      series: rc.series,
      issueNumber: rc.issue,
      publisher: rc.publisher,
      coverDate: rc.date,
      authors: rc.authors,
      artists: rc.artists,
      characters: rc.characters,
      tags: rc.tags,
      boardIds: [],
      image,
    });
    for (const b of rc.boards) {
      const id = boardIds.get(b);
      if (id) addComicToBoard(id, comic.id);
    }
    count++;
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  console.log(`Seeded ${count} comics and 2 boards.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
