-- 주간 회고를 뺐다(PRD 4.6, 13장 2026-10-05). 화면이 더 읽지 않는 주간 회고를 지운다
DELETE FROM `retrospectives` WHERE `kind` = 'weekly';
