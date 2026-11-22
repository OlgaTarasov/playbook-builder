-- Seed catalogue: predefined triggers and actions.
-- Idempotent: INSERT IGNORE skips rows whose unique name or sortOrder already exists.

INSERT IGNORE INTO `Trigger` (`id`, `name`) VALUES
  (UUID(), 'Malware Detected'),
  (UUID(), 'Login Attempt'),
  (UUID(), 'Phishing Alert');

INSERT IGNORE INTO `Action` (`id`, `name`, `sortOrder`) VALUES
  (UUID(), 'Isolate Host', 1),
  (UUID(), 'Notify Admin', 2),
  (UUID(), 'Block IP', 3);
