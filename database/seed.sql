-- Development data only. All six accounts use StudyTag!2026 (bcrypt cost 12).
-- Import once into an empty schema. Intentionally fails on duplicate IDs.
SET NAMES utf8mb4;
START TRANSACTION;
INSERT INTO users (id, role, name, email, password_hash) VALUES
(1, 'admin', 'ผู้ดูแลระบบ', 'admin@student-tag.test', '$2b$12$vdelgFWjKsI9G2u9YyUt1usVe/F1TBZ/E8z8HjvA0LPcvRkY7vB9G'),
(2, 'teacher', 'ครูอรทัย', 'teacher@student-tag.test', '$2b$12$vdelgFWjKsI9G2u9YyUt1usVe/F1TBZ/E8z8HjvA0LPcvRkY7vB9G'),
(3, 'student', 'นภัส', 'student1@student-tag.test', '$2b$12$vdelgFWjKsI9G2u9YyUt1usVe/F1TBZ/E8z8HjvA0LPcvRkY7vB9G'),
(4, 'student', 'ธนกฤต', 'student2@student-tag.test', '$2b$12$vdelgFWjKsI9G2u9YyUt1usVe/F1TBZ/E8z8HjvA0LPcvRkY7vB9G'),
(5, 'student', 'พิมพ์ชนก', 'student3@student-tag.test', '$2b$12$vdelgFWjKsI9G2u9YyUt1usVe/F1TBZ/E8z8HjvA0LPcvRkY7vB9G'),
(6, 'student', 'กิตติ', 'student4@student-tag.test', '$2b$12$vdelgFWjKsI9G2u9YyUt1usVe/F1TBZ/E8z8HjvA0LPcvRkY7vB9G');
INSERT INTO classes (id, teacher_id, name, section, join_code) VALUES
(1, 2, 'วิทยาศาสตร์รอบตัว', 'ม.2/1', 'SCI2026');
INSERT INTO class_members (class_id, user_id) VALUES (1, 3), (1, 4), (1, 5), (1, 6);
INSERT INTO assignments (class_id, title, description, due_at, max_points) VALUES
(1, 'สำรวจสิ่งมีชีวิตใกล้บ้าน', 'บันทึกสิ่งมีชีวิตที่พบและอธิบายลักษณะสำคัญ', NULL, 100),
(1, 'วัฏจักรน้ำ', 'อธิบายวัฏจักรน้ำด้วยภาษาของตนเอง', NULL, 20);
COMMIT;
