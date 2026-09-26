-- 기본 카테고리와 이유 태그(PRD 4.2). 마이그레이션이라 앱을 처음 열 때 한 번만 들어간다
INSERT INTO `categories` (`type`, `name`, `sort_order`, `is_default`) VALUES
	('expense', '식비', 0, 1),
	('expense', '카페·간식', 1, 1),
	('expense', '배달', 2, 1),
	('expense', '교통', 3, 1),
	('expense', '쇼핑', 4, 1),
	('expense', '생활', 5, 1),
	('expense', '주거·통신', 6, 1),
	('expense', '문화·여가', 7, 1),
	('expense', '의료·건강', 8, 1),
	('expense', '경조사·선물', 9, 1),
	('expense', '기타', 10, 1),
	('income', '급여', 0, 1),
	('income', '부수입', 1, 1),
	('income', '기타', 2, 1);
--> statement-breakpoint
INSERT INTO `reason_tags` (`name`, `sort_order`, `is_default`) VALUES
	('필요', 0, 1),
	('충동', 1, 1),
	('보상·스트레스', 2, 1),
	('약속·사교', 3, 1),
	('습관', 4, 1),
	('선물', 5, 1);
