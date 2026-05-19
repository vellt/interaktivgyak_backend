-- =============================================
-- Vizsgarendszer adatbázis séma
-- =============================================

CREATE DATABASE IF NOT EXISTS exam_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE exam_system;

-- Admin felhasználók
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kérdések
CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('single', 'multiple', 'sort', 'match', 'text') NOT NULL,
  question_text TEXT NOT NULL,
  image_path VARCHAR(500) NULL,
  code_snippet TEXT NULL,
  points INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Válaszlehetőségek (single, multiple kérdésekhez)
CREATE TABLE IF NOT EXISTS answer_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Párosítandó elemek (match típushoz)
CREATE TABLE IF NOT EXISTS match_pairs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  left_item TEXT NOT NULL,
  right_item TEXT NOT NULL,
  pair_order INT DEFAULT 0,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Sorba rendezendő elemek (sort típushoz)
CREATE TABLE IF NOT EXISTS sort_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  item_text TEXT NOT NULL,
  correct_position INT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Vizsgaülések
CREATE TABLE IF NOT EXISTS exam_sessions (
  id VARCHAR(36) PRIMARY KEY,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  time_expired BOOLEAN DEFAULT FALSE,
  score INT DEFAULT 0,
  max_score INT DEFAULT 20,
  percentage DECIMAL(5,2) DEFAULT 0,
  passed BOOLEAN DEFAULT FALSE
);

-- Vizsgán feltett kérdések
CREATE TABLE IF NOT EXISTS session_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  question_id INT NOT NULL,
  question_order INT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- Adott válaszok
CREATE TABLE IF NOT EXISTS session_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  question_id INT NOT NULL,
  answer_data JSON NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- =============================================
-- Alap admin fiók (jelszó: admin123)
-- =============================================
INSERT IGNORE INTO admins (username, password_hash) VALUES 
('admin', '$2a$10$rBV2JDeWW3.vKyeZt9p3T.GRtLPc3q6rBmJhRvFZCYBUXf7f5VxSi');

-- =============================================
-- Minta kérdések a docx alapján
-- =============================================

INSERT INTO questions (type, question_text) VALUES
('single', 'A távoli GitHub repository klónozva lett a helyi gépre (git clone segítségével). A helyi repository-ban az egyik állományon változtatást végzett, majd kiadta a „git commit" utasítást a megfelelő paraméterekkel, de azt tapasztalja, hogy a távoli GitHub repository-ban nem látszódik a változás. Mi az oka?');

SET @q1 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q1, 'A távoli repository-ban csak akkor lesz érvényes a változtatás, ha a „git push" utasítást kiadjuk.', TRUE),
(@q1, 'Később meg fog jelenni, de várni kell ehhez néhány órát.', FALSE),
(@q1, 'Csak akkor fog látszódni, ha manuálisan töltjük fel a változást a GitHub repository weboldalán.', FALSE),
(@q1, 'Ismét ki kell adni a git clone utasítást.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('multiple', 'Melyek az igaz állítások a Git és Github használatára vonatkozóan?');

SET @q2 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q2, 'Be lehet úgy állítani a GitHub repository-t, hogy bárki tudja olvasni a tartalmát regisztráció nélkül is.', TRUE),
(@q2, 'Van olyan fejlesztői környezet, amely támogatja a GitHub repository-val szinkronizálást.', TRUE),
(@q2, 'A GitHub felhasználói fiókon csak egy repository hozható létre, ha többet szeretnénk, akkor új fiókot kell regisztrálni.', FALSE),
(@q2, 'A repository-t mindenképpen a helyi gépen kell először létrehozni, és csak utána lehet a távolin létrehozni.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'A weboldal felső menüjében szeretnénk olyan menüpontokat létrehozni, amelyekre kattintva az adott weblapon belüli részekre lehet ugrani. Mivel oldható ez meg?');

SET @q3 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q3, 'A hivatkozásnál elegendő a href után a keresendő szöveget beírni, és a böngésző automatikusan megkeresi a megfelelő szöveget.', FALSE),
(@q3, 'Ahova szeretnénk ugrani, ott azonosítót (id, például „teszt") állítunk be a megfelelő elemhez, és a hivatkozásnál #teszt segítségével lehet a megfelelő helyre ugrani.', TRUE),
(@q3, 'Nem oldható meg, mert hivatkozás segítségével csak külső weblapokra lehet hivatkozni.', FALSE),
(@q3, 'Ahova szeretnénk ugrani, ott osztályt (class) állítunk be a megfelelő elemhez, és a hivatkozásnál #valami segítségével lehet a megfelelő helyre ugrani.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('match', 'Párosítsa a betűformázásokat ahhoz a CSS formázáshoz, amellyel meg lehet azt oldani!');

SET @q4 = LAST_INSERT_ID();
INSERT INTO match_pairs (question_id, left_item, right_item, pair_order) VALUES
(@q4, 'félkövér betű', 'font-weight', 1),
(@q4, 'dőlt betű', 'font-style', 2),
(@q4, 'betűtípus', 'font-family', 3),
(@q4, 'kiskapitális betű', 'font-variant', 4);

INSERT INTO questions (type, question_text, code_snippet) VALUES
('single', 'Adott a „result" azonosítóval ellátott DIV elem. Az ábrán szereplő JS kód mit fog kiírni ennek a DIV elemnek a belsejében?', 
'const n=10;\ndocument.getElementById("result").innerHTML="";\nfor(let i=1;i<=n/2;i++) {\n    if(n%i==0)\n        document.getElementById("result").innerHTML+=i+",";\n}\ndocument.getElementById("result").innerHTML+=n;');

SET @q5 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q5, '10', FALSE),
(@q5, '1,2,10', FALSE),
(@q5, '1,2,5', FALSE),
(@q5, '1,2,5,10', TRUE);

INSERT INTO questions (type, question_text) VALUES
('multiple', 'Melyek az igaz állítások a JavaScript Array (tömb) megvalósítására vonatkozóan?');

SET @q6 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q6, 'A hagyományos tömbtől eltérően itt az elemek száma változhat futási időben.', TRUE),
(@q6, 'A tömb elemeinek értékét nem lehet módosítani.', FALSE),
(@q6, 'Kizárólag számok tárolhatók benne, más típusú adatok nem.', FALSE),
(@q6, 'Nemcsak üres tömböt lehet deklarálni, a deklarációnál megadhatók a tömb elemeinek kezdőértékei.', TRUE),
(@q6, 'Az elemekre kerek zárójel () segítségével tudunk hivatkozni.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Online játékot fejleszt nemzetközi piacra. A játékbeli valuta felső határát szeretné konstans értékként eltárolni. Melyik azonosító felel meg leginkább a tiszta kód elvárásainak?');

SET @q7 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q7, 'ImaxCurrency!', FALSE),
(@q7, 'maxCurrency', TRUE),
(@q7, 'n//This is the max currency', FALSE),
(@q7, 'maximálisValuta', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Adott a User osztály, amelyet felhasználók 10 adatának tárolására használ. A metódus paraméterébe hogyan érdemes átadni a User adatait (tiszta kód elveit figyelembe véve)?');

SET @q8 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q8, 'A metódus paraméterébe nem adunk át semmit, hanem létrehozunk globális változót.', FALSE),
(@q8, 'A metódus paraméterébe csak a User objektum példányát adjuk át.', TRUE),
(@q8, 'A metódus paraméterébe mind a 10 adatot átadjuk egyesével, és a végén a teljes User objektum példányt is.', FALSE),
(@q8, 'A metódus paraméterébe mind a 10 adatot átadjuk egyesével.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Adott a Jatekosok nevű tábla, amelyben az egyik mező a „nev". Hogyan lehet „Minta József" játékos adatait törölni a táblából?');

SET @q9 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q9, 'DELETE Jatekosok WHERE nev="Minta József";', FALSE),
(@q9, 'REMOVE FROM Jatekosok WHERE nev="Minta József";', FALSE),
(@q9, 'DELETE nev FROM Jatekosok WHERE nev="Minta József";', FALSE),
(@q9, 'DELETE FROM Jatekosok WHERE nev="Minta József";', TRUE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Milyen módosítót kell írni C# vagy Java nyelvben egy metódus elé, ha szeretnénk, hogy bárhol elérhető legyen, akár az osztályon kívül is?');

SET @q10 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q10, 'protected', FALSE),
(@q10, 'public', TRUE),
(@q10, 'static', FALSE),
(@q10, 'include', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Mi a CMS (tartalomkezelő) rendszer lényege?');

SET @q11 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q11, 'Leíró nyelv, amellyel a weblap formázását lehet megadni.', FALSE),
(@q11, 'A segítségével a weblapot olyan felhasználók is tudják szerkeszteni, akiknek nincs webfejlesztési és programozási tapasztalata.', TRUE),
(@q11, 'Szülői felügyelet alkalmazása.', FALSE),
(@q11, 'Asztali alkalmazás fejlesztésére szolgáló programozási környezet.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('sort', 'Állítsa sorrendbe a felsorolt 4 tesztelési technikát a V-modell alapján! (alulról felfelé haladva a V-modell második szárán)');

SET @q12 = LAST_INSERT_ID();
INSERT INTO sort_items (question_id, item_text, correct_position) VALUES
(@q12, 'Komponens teszt (például Unit teszt)', 1),
(@q12, 'Integrációs teszt', 2),
(@q12, 'Rendszerteszt', 3),
(@q12, 'Felhasználói átvételi teszt', 4);

INSERT INTO questions (type, question_text) VALUES
('single', 'Hogyan nevezzük azt a tesztelési módszert, amikor ismerjük a forráskódot is?');

SET @q13 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q13, 'Funkcionális tesztelés.', FALSE),
(@q13, 'Fekete dobozos tesztelés.', FALSE),
(@q13, 'Fehér dobozos tesztelés.', TRUE),
(@q13, 'Fizikai tesztelés.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('multiple', 'Melyek az igaz állítások az API fetch kérésekkel kapcsolatban?');

SET @q14 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q14, 'Az adatok legtöbb esetben lekérhetők, azonban akadályozhatja a lekérést a CORS beállítása vagy az API kulcs hiánya.', TRUE),
(@q14, 'Előfordulhat, hogy az API kérések számát korlátozza a rendszer.', TRUE),
(@q14, 'Az API kérés megoldható minden esetben, azonban mindig szükséges API kulcs hozzá.', FALSE),
(@q14, 'Az API kérést csak szerver oldalon lehet megoldani, kliens oldalon nem.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('multiple', 'Döntse el, hogy az alábbi mondatok igaz állítást tartalmaznak-e a Frontend webfejlesztéssel kapcsolatban!');

SET @q15 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q15, 'A Frontend fejlesztő anélkül is tud dolgozni a weboldalon, hogy a Backend kódját ismerné.', TRUE),
(@q15, 'A JavaScriptnek létezik Frontend készítésére szolgáló keretrendszere.', TRUE),
(@q15, 'Ameddig a Backend rész fejlesztése nincs kész, a Frontend rész nem kezdhető el.', FALSE),
(@q15, 'A weblap Frontend és Backend része minden esetben teljesen szétválik.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Mi a megszokott módszer adatbázisok kezelésére a modern Backend fejlesztői környezeteknél?');

SET @q16 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q16, 'Minden esetben kötelező SQL utasításokat futtatni.', FALSE),
(@q16, 'Az adatbázis tárolása nem a Backend, hanem a Frontend feladata.', FALSE),
(@q16, 'Az ORM segítségével az adatbázist a Backend rendszer objektumokra képezi le, és így a kódban objektumok módosításával végezhetők az adatbázis műveletei.', TRUE),
(@q16, 'Nincs adatbázis tárolva, csak txt állományokban van az adat tárolva.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Készített Android-ra alkalmazást, de kiderült, hogy igény van rá iOS-en is. Melyik az igaz állítás?');

SET @q17 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q17, 'Az alkalmazás fejlesztését nem feltétlenül szükséges az elejétől kezdeni, de szükséges kiegészíteni a kódot, hogy működjön iOS-en is.', TRUE),
(@q17, 'Minden esetben futtatható az Android-ra írt alkalmazás iOS-en is.', FALSE),
(@q17, 'Semmiképpen nem lehetséges átírni, a fejlesztést teljesen az elejétől kell kezdeni.', FALSE),
(@q17, 'Az alkalmazás átírható, azonban más fejlesztői környezetet kell választani, mivel nincs olyan környezet, ami egyaránt támogatja az Android-ot és iOS-t is.', FALSE);

INSERT INTO questions (type, question_text) VALUES
('single', 'Hogyan lehetne a legcélszerűbben megoldani egy Backend API végpontot, amellyel adott évek között lehet játékokat keresni?');

SET @q18 = LAST_INSERT_ID();
INSERT INTO answer_options (question_id, option_text, is_correct) VALUES
(@q18, 'A végpont minden esetben a teljes adatbázis tartalmát adja vissza, és majd JavaScript segítségével ki lehet az adatokat választani.', FALSE),
(@q18, 'Minden egyes keresésnél a Backend fejlesztőnek külön API végpontot kell írni a kereséshez.', FALSE),
(@q18, 'A végpontot paraméterezve írja meg, így az API kérésnél már csak a kiválasztott játékok kerülnek visszaadásra.', TRUE),
(@q18, 'Nem megoldható, a Backend fejlesztő minden esetben lekéri az adatokat, és email-ben átküldi a visszaadott JSON adatot.', FALSE);
