CREATE TABLE `accounting_internal_login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`ipAddress` varchar(64),
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_internal_login_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_login_attempts_username_ip` UNIQUE(`username`,`ipAddress`)
);
