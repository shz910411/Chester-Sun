/**
 * 迈思美数据模型 v2 —— 16 张表（照《02 技术架构与数据模型》落地）
 * 健康相关数据合规要点：图片只存 file_key 不进库；生化/舌诊只存不解读；服务者只读。
 */
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, Unique,
} from 'typeorm';

// 1. 用户（登录唯一=openid；业务唯一=phone）
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column() openid: string;
  @Index({ unique: true, where: 'phone IS NOT NULL' }) @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) unionid: string;           // 预留：与九洲福同主体后跨端对齐
  @Column({ nullable: true }) nickname: string;
  @Column({ nullable: true }) avatar: string;
  @Column({ nullable: true }) gender: string;            // male/female/unknown
  @Column({ type: 'int', nullable: true }) height_cm: number;
  @Column({ type: 'int', nullable: true }) age: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) target_weight_kg: number;
  @Column({ type: 'uuid', nullable: true }) advisor_id: string;   // 服务老师标签（单层）
  @Column({ nullable: true }) group_tag: string;                  // 后台自由分组
  @Column({ default: 'active' }) status: string;
  @CreateDateColumn() created_at: Date;
}

// 2. 服务老师字典（仅后台维护，不是登录账号）
@Entity('advisors')
export class Advisor {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) note: string;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() created_at: Date;
}

// 3. 公司后台账号（仅 admin/viewer 两档）
@Entity('admin_accounts')
export class AdminAccount {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column() username: string;
  @Column() password_hash: string;
  @Column({ default: 'viewer' }) role: string;   // admin / viewer
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() created_at: Date;
}

// 4. 同意留痕（隐私 / 健康数据，支持撤回）
@Entity('consent_records')
export class ConsentRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) user_id: string;
  @Column() type: string;            // privacy / health_data
  @Column({ default: 'v1' }) version: string;
  @CreateDateColumn() granted_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) revoked_at: Date;
}

// 5. 称重记录（含体成分；蓝牙时由 raw_payload 归一化）
@Entity('weight_records')
export class WeightRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'numeric', precision: 5, scale: 2 }) weight_kg: number;
  @Column({ type: 'timestamptz' }) measured_at: Date;
  @Column({ default: 'manual' }) source: string;    // manual/photo/ble
  @Column({ default: false }) is_morning: boolean;
  @Column({ nullable: true }) photo_key: string;
  @Column({ nullable: true }) supplier_record_id: string;
  @Column({ nullable: true }) client_uuid: string;  // 幂等键
  @Column({ type: 'jsonb', nullable: true }) raw_payload: any;
  // —— 体成分（均可空）——
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) bmi: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) body_fat_pct: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) fat_kg: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) subcut_fat_pct: number;
  @Column({ type: 'int', nullable: true }) visceral_fat_level: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) water_pct: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) skeletal_muscle_kg: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) muscle_kg: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) bone_kg: number;
  @Column({ type: 'int', nullable: true }) bmr_kcal: number;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) protein_pct: number;
  @Column({ type: 'int', nullable: true }) body_age: number;
  @Column({ type: 'int', nullable: true }) health_score: number;
  @Column({ type: 'int', nullable: true }) fatty_liver_level: number; // 存而默认不展示（敏感）
  @CreateDateColumn() created_at: Date;
}

// 6. 餐食打卡（一次一条）
@Entity('meal_records')
export class MealRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) user_id: string;
  @Index() @Column({ type: 'date' }) meal_date: string;
  @Column() meal_type: string;        // breakfast/lunch/dinner/snack
  @Column({ nullable: true }) photo_key: string;
  @Column({ default: 'food' }) photo_kind: string;  // food/label
  @Column({ default: 'pending' }) ai_status: string; // pending/done/failed
  @Column({ type: 'jsonb', nullable: true }) ai_raw: any;
  @Column({ nullable: true }) note: string;
  @CreateDateColumn() created_at: Date;
}

// 7. 餐食条目（解析/修正后；当日汇总 = sum(kcal)）
@Entity('meal_items')
export class MealItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) meal_record_id: string;
  @Column() food_name: string;
  @Column({ nullable: true }) portion_text: string;
  @Column({ type: 'int', nullable: true }) kcal: number;
  @Column({ default: 'ai' }) source: string;  // ai/user/label_ocr
}

// 8. 每日快捷记录（饮水/排便/睡眠；user+date 唯一）
@Entity('daily_logs')
@Unique(['user_id', 'log_date'])
export class DailyLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'date' }) log_date: string;
  @Column({ type: 'int', default: 0 }) water_cups: number;
  @Column({ type: 'int', default: 250 }) water_cup_ml: number;
  @Column({ type: 'int', default: 0 }) bowel_count: number;
  @Column({ nullable: true }) bowel_status: string;  // smooth/normal/hard
  @Column({ type: 'numeric', precision: 3, scale: 1, nullable: true }) sleep_hours: number;
  @Column({ nullable: true }) note: string;
}

// 9. 归属调整留痕
@Entity('advisor_change_logs')
export class AdvisorChangeLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'uuid', nullable: true }) old_advisor_id: string;
  @Column({ type: 'uuid', nullable: true }) new_advisor_id: string;
  @Column({ nullable: true }) changed_by: string;
  @CreateDateColumn() changed_at: Date;
}

// 10. 数据共享（=加好友逻辑；一人可共享给多人；(owner,viewer) active 唯一在应用层校验）
@Entity('data_shares')
@Index(['owner_user_id', 'viewer_user_id'])
export class DataShare {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) owner_user_id: string;   // 数据主人（被看的人）
  @Column({ type: 'uuid' }) viewer_user_id: string;  // 查看者（看的人）
  @Column({ default: 'active' }) status: string;     // active / revoked
  @Column({ default: 'user_invite' }) source: string; // user_invite / company_assign
  @Column({ nullable: true }) invite_code: string;
  @CreateDateColumn() created_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) revoked_at: Date;
}

// 10b. 共享邀请码（24h 单次有效；claim 后建 data_share）
@Entity('share_invites')
export class ShareInvite {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column() code: string;
  @Column({ type: 'uuid' }) owner_user_id: string;     // 谁的数据要被共享
  @Column({ default: 'pending' }) status: string;       // pending/claimed/expired
  @Column({ type: 'uuid', nullable: true }) claimed_by: string;
  @Column({ type: 'timestamptz' }) expires_at: Date;
  @CreateDateColumn() created_at: Date;
}

// 11. 服务者备注（visible_to_owner=「老师的话」在用户当日汇总展示）
@Entity('service_notes')
export class ServiceNote {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) owner_user_id: string;
  @Column({ type: 'uuid' }) author_user_id: string;
  @Column({ type: 'date', nullable: true }) ref_date: string;
  @Column({ type: 'text' }) content: string;
  @Column({ default: 'visible_to_owner' }) visibility: string; // visible_to_owner/team_only
  @CreateDateColumn() created_at: Date;
}

// 12. 服务者逐日归档/关注标记（(owner,viewer,date) 唯一）
@Entity('service_day_marks')
@Unique(['owner_user_id', 'viewer_user_id', 'mark_date'])
export class ServiceDayMark {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) owner_user_id: string;
  @Column({ type: 'uuid' }) viewer_user_id: string;
  @Column({ type: 'date' }) mark_date: string;
  @Column() mark: string;   // reviewed/flagged
  @CreateDateColumn() created_at: Date;
}

// 13. 阶段记录（体型照三面/围度/舌诊；photo 全私有桶；可见性用户可关）
@Entity('stage_records')
export class StageRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) user_id: string;
  @Column({ default: 'periodic' }) stage: string;  // baseline/periodic/final
  @Column({ type: 'timestamptz' }) taken_at: Date;
  @Column({ nullable: true }) front_photo_key: string;
  @Column({ nullable: true }) side_photo_key: string;
  @Column({ nullable: true }) back_photo_key: string;
  @Column({ nullable: true }) tongue_photo_key: string;
  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true }) waist_cm: number;
  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true }) hip_cm: number;
  @Column({ type: 'numeric', precision: 5, scale: 1, nullable: true }) thigh_cm: number;
  @Column({ default: true }) visible_to_advisors: boolean;
  @Column({ nullable: true }) note: string;
  @CreateDateColumn() created_at: Date;
}

// 14. 生化/体检报告（仅存储与展示，系统不做任何医疗解读）
@Entity('health_reports')
export class HealthReport {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'uuid' }) user_id: string;
  @Column({ default: 'biochem' }) type: string;  // biochem/physical/other
  @Column() file_key: string;
  @Column({ type: 'timestamptz', nullable: true }) taken_at: Date;
  @Column({ nullable: true }) note: string;
  @Column({ default: true }) visible_to_advisors: boolean;
  @CreateDateColumn() created_at: Date;
}

// 15. 媒体下载审计（谁·下载了谁的·哪些图·何时）
@Entity('media_download_logs')
export class MediaDownloadLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ nullable: true }) operator_id: string;
  @Column({ type: 'uuid', nullable: true }) owner_user_id: string;
  @Column({ default: 'single' }) scope: string;  // single/batch
  @Column({ type: 'jsonb', nullable: true }) detail: any; // file_keys / date_range
  @CreateDateColumn() created_at: Date;
}

// 16. 异步导出任务
@Entity('export_jobs')
export class ExportJob {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ nullable: true }) operator_id: string;
  @Column({ type: 'jsonb', nullable: true }) params: any;
  @Column({ default: 'pending' }) status: string;  // pending/done/failed
  @Column({ nullable: true }) zip_key: string;
  @Column({ type: 'timestamptz', nullable: true }) expires_at: Date;
  @CreateDateColumn() created_at: Date;
}
