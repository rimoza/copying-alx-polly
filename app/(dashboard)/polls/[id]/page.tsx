'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getPollById, submitVote, deletePoll } from '@/app/lib/actions/poll-actions';
import { useAuth } from '@/app/lib/context/auth-context';
import { createClient } from '@/lib/supabase/client';

interface Poll {
  id: string;
  question: string;
  options: string[];
  user_id: string;
  created_at: string;
}

interface VoteCount {
  option_index: number;
  count: number;
}

export default function PollDetailPage({ params }: { params: { id: string } }) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<VoteCount[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchPoll();
    checkVoteStatus();
    fetchVoteCounts();
  }, [params.id]);

  const fetchPoll = async () => {
    const result = await getPollById(params.id);
    if (result.error) {
      setError(result.error);
    } else if (result.poll) {
      setPoll(result.poll);
      setIsOwner(user?.id === result.poll.user_id);
    }
    setLoading(false);
  };

  const checkVoteStatus = async () => {
    if (!user) return;
    
    const supabase = createClient();
    const { data } = await supabase
      .from("votes")
      .select("id")
      .eq("poll_id", params.id)
      .eq("user_id", user.id)
      .single();
    
    if (data) setHasVoted(true);
  };

  const fetchVoteCounts = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("votes")
      .select("option_index")
      .eq("poll_id", params.id);
    
    if (data) {
      const counts: { [key: number]: number } = {};
      data.forEach(vote => {
        counts[vote.option_index] = (counts[vote.option_index] || 0) + 1;
      });
      
      const countsArray = Object.entries(counts).map(([index, count]) => ({
        option_index: parseInt(index),
        count: count as number
      }));
      
      setVoteCounts(countsArray);
    }
  };

  const totalVotes = voteCounts.reduce((sum, vote) => sum + vote.count, 0);

  const handleVote = async () => {
    if (selectedOption === null || !user) {
      setError("Please select an option and ensure you're logged in");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    const result = await submitVote(params.id, selectedOption);
    
    if (result.error) {
      setError(result.error);
    } else {
      setHasVoted(true);
      fetchVoteCounts(); // Refresh vote counts
    }
    
    setIsSubmitting(false);
  };

  const handleDelete = async () => {
    if (!isOwner) return;
    
    const result = await deletePoll(params.id);
    if (result.error) {
      setError(result.error);
    } else {
      window.location.href = '/polls';
    }
  };

  const getPercentage = (votes: number) => {
    if (totalVotes === 0) return 0;
    return Math.round((votes / totalVotes) * 100);
  };

  if (loading) {
    return <div className="p-6">Loading poll...</div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
        <Link href="/polls" className="text-blue-600 hover:underline mt-4 inline-block">
          &larr; Back to Polls
        </Link>
      </div>
    );
  }

  if (!poll) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-600">Poll not found</h2>
          <Link href="/polls" className="text-blue-600 hover:underline mt-4 inline-block">
            &larr; Back to Polls
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/polls" className="text-blue-600 hover:underline">
          &larr; Back to Polls
        </Link>
        {isOwner && (
          <div className="flex space-x-2">
            <Button variant="outline" asChild>
              <Link href={`/polls/${params.id}/edit`}>Edit Poll</Link>
            </Button>
            <Button 
              variant="outline" 
              className="text-red-500 hover:text-red-700"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{poll.question}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          {!user && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
              Please <Link href="/login" className="underline">login</Link> to vote on this poll.
            </div>
          )}
          
          {user && !hasVoted ? (
            <div className="space-y-3">
              {poll.options.map((option, index) => (
                <div 
                  key={index} 
                  className={`p-3 border rounded-md cursor-pointer transition-colors ${selectedOption === index ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}
                  onClick={() => setSelectedOption(index)}
                >
                  {option}
                </div>
              ))}
              <Button 
                onClick={handleVote} 
                disabled={selectedOption === null || isSubmitting} 
                className="mt-4"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Vote'}
              </Button>
            </div>
          ) : user && hasVoted ? (
            <div className="space-y-4">
              <h3 className="font-medium">Results:</h3>
              {poll.options.map((option, index) => {
                const voteCount = voteCounts.find(v => v.option_index === index)?.count || 0;
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{option}</span>
                      <span>{getPercentage(voteCount)}% ({voteCount} votes)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${getPercentage(voteCount)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
              <div className="text-sm text-slate-500 pt-2">
                Total votes: {totalVotes}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-medium">Results (Login to vote):</h3>
              {poll.options.map((option, index) => {
                const voteCount = voteCounts.find(v => v.option_index === index)?.count || 0;
                return (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{option}</span>
                      <span>{getPercentage(voteCount)}% ({voteCount} votes)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${getPercentage(voteCount)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
              <div className="text-sm text-slate-500 pt-2">
                Total votes: {totalVotes}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-sm text-slate-500 flex justify-between">
          <span>Poll ID: {poll.id.substring(0, 8)}...</span>
          <span>Created: {new Date(poll.created_at).toLocaleDateString()}</span>
        </CardFooter>
      </Card>

      {/* Share section removed for security - use the VulnerableShare component if needed */}
    </div>
  );
}