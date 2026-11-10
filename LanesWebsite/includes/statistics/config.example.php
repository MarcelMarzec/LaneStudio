<?php
// The statistics collector's settings. Copy this file to config.php beside it ON THE SERVER and fill it in.
// config.php is never committed or deployed (it holds the database password); see docs/develop/Statistics.md.

return [
    // The database the changesets are kept in. On cPanel: MySQL Databases → create a database and a user,
    // add the user to the database with ALL PRIVILEGES, and put their names here (cPanel prefixes both with
    // your account name).
    'dsn'      => 'mysql:host=localhost;dbname=CPANELUSER_lanestudio;charset=utf8mb4',
    'username' => 'CPANELUSER_stats',
    'password' => 'the password you gave the database user',

    // To try it on your own computer instead, a file needs no database server:
    // 'dsn' => 'sqlite:' . __DIR__ . '/statistics.sqlite',

    // The first day to collect, used once, when the database is empty.
    'start' => '2026-10-12',

    // OpenStreetMap user ids (the number on a user's changesets, `uid`) to show as "A mapper" and leave off the
    // leaderboard, for anyone who asks. Their changesets still count in the totals.
    'hidden_users' => [],
];
