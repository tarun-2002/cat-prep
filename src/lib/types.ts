export type TopicRow = {
  id: string;
  section: "QUANT" | "DILR" | "VARC";
  title: string;
  study_link: string;
  display_order: number;
};

export type SubtopicRow = {
  id: string;
  topic_id: string;
  title: string;
  display_order: number;
};

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type SubmissionRow = {
  id: string;
  user_id: string;
  topic_id: string;
  subtopic_id: string | null;
  topic_questions_done: number;
  pyq_questions_done: number;
  topic_question_proof_urls: string[];
  pyq_proof_urls: string[];
  short_notes_urls: string[];
  status: SubmissionStatus;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
};
