# Artist search and Windows seeking — 1.7.8

Artist entities use Deezer and Apple catalog metadata. Profiles combine artist top tracks, artist song lookups, name searches, credited collaborations and album lookups. Albums opened from the profile request the album's track list. Only matching artist credits are included; substring matches do not count. Official live recordings remain available in artist catalogs.

Search preserves query relevance, then orders matching songs by available catalog rank or recording view count. Unknown popularity remains unknown (zero sorting weight). These values are not Spotify statistics. Catalog requests are cached for five minutes. Apple lookup limits mean a profile is not a guarantee of the artist's entire worldwide catalog. No biographies or monthly listener counts are invented.

Live catalog checks confirmed Deezer artist search, Nirvana artist 415 top tracks with ranking, and Apple DOROFEEVA artist 1537571533 song and album lookups. Same-name Deezer artist selection prefers the more popular catalog entity.

Windows seeking previously received a ranged audio body with HTTP 200 and no Content-Range. The audio protocol now streams exact byte intervals with HTTP 206, Content-Range, Content-Length and Accept-Ranges, supports HEAD and reports unsatisfiable ranges with 416. File access still passes through the existing authorization layer.

Local validation: 61 unit tests; 35 desktop/mobile browser scenarios; real Electron import and audible playback, exact 20-byte range response, seeking to 12 seconds while playing and 5 seconds while paused, background playback and update helper replacement/restart; Android debug and test APK compilation plus lint.

Release automation additionally verifies Android playback on API 29 and API 35 with 16 KB pages, Windows runtime, and signed release builds. Publication follows verification of release asset hashes, Android signing continuity and packaged source files.
