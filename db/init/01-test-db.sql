-- Runs once, when the MySQL container initialises its data volume.
-- Creates the database used by the backend integration tests and lets the
-- app user (created from MYSQL_USER) use it. The tests never touch `playbooks`.
CREATE DATABASE IF NOT EXISTS playbooks_test;
GRANT ALL PRIVILEGES ON playbooks_test.* TO 'playbooks'@'%';
FLUSH PRIVILEGES;
