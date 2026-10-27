<?php
defined('SITE') or exit;
?>
    </main>

    <footer>
      <div class="footer-inner">
        <div class="footer-identity">
          <a class="footer-brand" href="/"><span><?= e($site['name']) ?></span></a>
          <ul class="footer-social">
            <?php foreach ($socials as $social): ?>
              <li>
                <a href="<?= e($social['href']) ?>" target="_blank" rel="noopener"
                   title="<?= e($social['label']) ?>">
                  <?php icon_by_name($social['icon']); ?>
                  <span class="visually-hidden"><?= e($social['label']) ?></span>
                </a>
              </li>
            <?php endforeach; ?>
          </ul>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end">
          <div class="footer-links">
            <a href="/">Overview</a>
            <a href="/changelog">Changelog</a>
            <a href="/privacy_policy">Privacy</a>
            <a href="<?= e($site['contact']) ?>" target="_blank" rel="noopener">Contact</a>
          </div>
          <div class="footer-links">
            <a href="<?= e($site['editor']) ?>" target="_blank" rel="noopener">Open the editor</a>
            <a href="<?= e($site['github']) ?>" target="_blank" rel="noopener">GitHub</a>
            <a href="<?= e($site['home']) ?>" target="_blank" rel="noopener">marcelmarzec.com</a>
          </div>
        </div>
      </div>
      <p class="footer-copy">
        Hosted with <a href="<?= e($site['host']) ?>" target="_blank" rel="sponsored noopener">FyFeWeb</a>
        &mdash; that is an affiliate link, so I may earn a commission if you sign up through it.
      </p>
      <p class="footer-copy">
        &copy; <?= date('Y') ?> <?= e($site['author']) ?>. Registered sole trader in England.
        Lane Studio is a fork of <a href="https://github.com/openstreetmap/iD">iD</a> and is not
        affiliated with the OpenStreetMap Foundation.
      </p>
    </footer>

    <script>
      ;(function () {
        var open = function () { return document.querySelectorAll('.nav-dropdown[open]') }

        document.addEventListener('click', function (event) {
          open().forEach(function (d) {
            if (!d.contains(event.target)) d.open = false
          })
        })

        document.addEventListener('keydown', function (event) {
          if (event.key !== 'Escape') return
          open().forEach(function (d) {
            d.open = false
            d.querySelector('summary').focus()
          })
        })
      })()
    </script>
  </body>
</html>
