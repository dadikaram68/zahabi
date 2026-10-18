CREATE TABLE `accounting_mfa_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mode` enum('totp','email') NOT NULL,
	`challengeTokenHash` varchar(128) NOT NULL,
	`codeHash` varchar(128),
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounting_mfa_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_mfa_challenge_token` UNIQUE(`challengeTokenHash`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `mfaEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mfaMode` enum('totp','email') DEFAULT 'totp';--> statement-breakpoint
ALTER TABLE `users` ADD `mfaSecretEncrypted` text;--> statement-breakpoint
ALTER TABLE `accounting_mfa_challenges` ADD CONSTRAINT `accounting_mfa_challenges_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;