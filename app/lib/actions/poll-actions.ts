"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ADMIN FUNCTIONS
async function isAdmin(userId: string): Promise<boolean> {
  // For demo purposes, we'll check if user email contains 'admin'
  // In a real app, you'd have a proper roles table
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  
  if (!user.user || user.user.id !== userId) return false;
  
  // Check if user email contains 'admin' (simple check for demo)
  return user.user.email?.includes('admin') || false;
}

export async function checkAdminAccess() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return { isAdmin: false, error: "Not authenticated" };
  }
  
  const adminStatus = await isAdmin(user.id);
  return { isAdmin: adminStatus, error: null };
}

export async function getAllPollsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return { polls: [], error: "Not authenticated" };
  }
  
  const adminCheck = await isAdmin(user.id);
  if (!adminCheck) {
    return { polls: [], error: "Admin access required" };
  }
  
  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { polls: [], error: error.message };
  return { polls: data ?? [], error: null };
}

export async function deletePollAdmin(id: string) {
  const supabase = await createClient();
  
  // Check if user is authenticated and is admin
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated" };
  }

  const adminCheck = await isAdmin(user.id);
  if (!adminCheck) {
    return { error: "Admin access required" };
  }

  // Admin can delete any poll
  const { error } = await supabase
    .from("polls")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { error: null };
}

// CREATE POLL
export async function createPoll(formData: FormData) {
  const supabase = await createClient();

  const question = formData.get("question") as string;
  const options = formData.getAll("options").filter(Boolean) as string[];

  // Input validation and sanitization
  if (!question || question.trim().length === 0) {
    return { error: "Please provide a valid question." };
  }
  
  if (question.length > 500) {
    return { error: "Question must be 500 characters or less." };
  }
  
  if (options.length < 2) {
    return { error: "Please provide at least two options." };
  }
  
  if (options.length > 10) {
    return { error: "Maximum 10 options allowed." };
  }
  
  // Sanitize and validate options
  const sanitizedOptions = options.map(option => {
    const trimmed = option.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length > 200) {
      return null;
    }
    return trimmed;
  }).filter(Boolean);
  
  if (sanitizedOptions.length < 2) {
    return { error: "Please provide at least two valid options (max 200 characters each)." };
  }
  
  // Check for duplicate options
  const uniqueOptions = [...new Set(sanitizedOptions)];
  if (uniqueOptions.length !== sanitizedOptions.length) {
    return { error: "Duplicate options are not allowed." };
  }

  const sanitizedQuestion = question.trim();

  // Get user from session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message };
  }
  if (!user) {
    return { error: "You must be logged in to create a poll." };
  }

  const { error } = await supabase.from("polls").insert([
    {
      user_id: user.id,
      question: sanitizedQuestion,
      options: sanitizedOptions,
    },
  ]);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/polls");
  return { error: null };
}

// GET USER POLLS
export async function getUserPolls() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { polls: [], error: "Not authenticated" };

  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { polls: [], error: error.message };
  return { polls: data ?? [], error: null };
}

// GET POLL BY ID
export async function getPollById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return { poll: null, error: error.message };
  return { poll: data, error: null };
}

// SUBMIT VOTE
export async function submitVote(pollId: string, optionIndex: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Require authentication for voting to prevent manipulation
  if (!user) return { error: 'You must be logged in to vote.' };

  // Check if user has already voted on this poll
  const { data: existingVote } = await supabase
    .from("votes")
    .select("id")
    .eq("poll_id", pollId)
    .eq("user_id", user.id)
    .single();

  if (existingVote) {
    return { error: "You have already voted on this poll." };
  }

  // Validate poll exists before allowing vote
  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("options")
    .eq("id", pollId)
    .single();

  if (pollError || !poll) {
    return { error: "Poll not found." };
  }

  // Validate option index is within bounds
  if (optionIndex < 0 || optionIndex >= poll.options.length) {
    return { error: "Invalid option selected." };
  }

  const { error } = await supabase.from("votes").insert([
    {
      poll_id: pollId,
      user_id: user.id,
      option_index: optionIndex,
    },
  ]);

  if (error) return { error: error.message };
  return { error: null };
}

// DELETE POLL
export async function deletePoll(id: string) {
  const supabase = await createClient();
  
  // Check if user is authenticated
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message };
  }
  if (!user) {
    return { error: "You must be logged in to delete a poll." };
  }

  // Only allow deleting polls owned by the user or admin users
  const { error } = await supabase
    .from("polls")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id); // This ensures only poll owners can delete

  if (error) return { error: error.message };
  revalidatePath("/polls");
  return { error: null };
}

// UPDATE POLL
export async function updatePoll(pollId: string, formData: FormData) {
  const supabase = await createClient();

  const question = formData.get("question") as string;
  const options = formData.getAll("options").filter(Boolean) as string[];

  // Input validation and sanitization (same as createPoll)
  if (!question || question.trim().length === 0) {
    return { error: "Please provide a valid question." };
  }
  
  if (question.length > 500) {
    return { error: "Question must be 500 characters or less." };
  }
  
  if (options.length < 2) {
    return { error: "Please provide at least two options." };
  }
  
  if (options.length > 10) {
    return { error: "Maximum 10 options allowed." };
  }
  
  // Sanitize and validate options
  const sanitizedOptions = options.map(option => {
    const trimmed = option.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length > 200) {
      return null;
    }
    return trimmed;
  }).filter(Boolean);
  
  if (sanitizedOptions.length < 2) {
    return { error: "Please provide at least two valid options (max 200 characters each)." };
  }
  
  // Check for duplicate options
  const uniqueOptions = [...new Set(sanitizedOptions)];
  if (uniqueOptions.length !== sanitizedOptions.length) {
    return { error: "Duplicate options are not allowed." };
  }

  const sanitizedQuestion = question.trim();

  // Get user from session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    return { error: userError.message };
  }
  if (!user) {
    return { error: "You must be logged in to update a poll." };
  }

  // Only allow updating polls owned by the user
  const { error } = await supabase
    .from("polls")
    .update({ question: sanitizedQuestion, options: sanitizedOptions })
    .eq("id", pollId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
