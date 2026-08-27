"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { addMaintenancePhoto, addCompletedPhoto, updateMaintenanceStatus } from "@/lib/actions";
import FileUploader from "@/components/FileUploader";

export default function VendorPortal() {
  const supabase = createClient();
  const [tab, setTab] = useState("my-jobs");
  const [jobs, setJobs] = useState<any[]>([]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from("maintenance_requests")
      .select("*, units(*), properties(*)").eq("assigned_vendor_user_id", user!.id);
    setJobs(data || []);
  }

  useEffect(() => { load(); }, []);

  async function handleUpdateStatus(id: string, status: string) {
    await updateMaintenanceStatus(id, status);
    load();
  }

  const activeJobs = jobs.filter(j => j.status !== "completed");
  const completedJobs = jobs.filter(j => j.status === "completed");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Caretaker Portal</h1>
      
      {/* NEW: Tabs for my jobs vs completed */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("my-jobs")}
          className={`px-4 py-2 rounded-lg ${tab === "my-jobs" ? "bg-indigo-600 text-white" : "bg-white"}`}>
          My Jobs ({activeJobs.length})
        </button>
        <button onClick={() => setTab("completed")}
          className={`px-4 py-2 rounded-lg ${tab === "completed" ? "bg-indigo-600 text-white" : "bg-white"}`}>
          Completed ({completedJobs.length})
        </button>
      </div>

      {tab === "my-jobs" && (
        <div className="space-y-3">
          {activeJobs.map(j => (
            <div key={j.id} className="bg-white p-4 rounded-xl">
              <div className="flex justify-between mb-2">
                <div>
                  <b className="text-lg">{j.title}</b>
                  <div className="text-sm text-gray-500">{j.properties?.name} {j.units?.name && `• ${j.units?.name}`}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  j.status === "in_progress" ? "bg-blue-100" : "bg-yellow-100"
                }`}>{j.status}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{j.description}</p>
              
              {/* Issue Photos (from manager) */}
              {(j.issue_photos || []).length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-gray-500 mb-1">REFERENCE PHOTOS</div>
                  <div className="flex gap-2 flex-wrap">
                    {j.issue_photos.map((ph: string, i: number) => (
                      <a key={i} href={ph} target="_blank" className="text-indigo-600 text-xs underline">
                        Photo {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-3 flex-wrap items-center">
                {j.status === "open" && (
                  <button onClick={() => handleUpdateStatus(j.id, "in_progress")} 
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Start Job</button>
                )}
                {j.status === "in_progress" && (
                  <button onClick={() => handleUpdateStatus(j.id, "completed")} 
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm">Mark Complete</button>
                )}
                
                {/* NEW: Upload completion photo */}
                {j.status === "in_progress" && (
                  <FileUploader 
                    folder="vendor" 
                    mode="image-video"
                    onUploaded={async (meta) => { 
                      await addCompletedPhoto(j.id, meta.file); 
                      load();
                    }} 
                  />
                )}
              </div>

              {/* NEW: Already uploaded completion photos */}
              {(j.completed_photos || []).length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-green-600 mb-1">YOUR COMPLETION PHOTOS</div>
                  <div className="flex gap-2 flex-wrap">
                    {j.completed_photos.map((ph: string, i: number) => (
                      <a key={i} href={ph} target="_blank" className="text-green-600 text-xs underline">
                        Done {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {activeJobs.length === 0 && (
            <p className="text-gray-400">No active jobs assigned to you.</p>
          )}
        </div>
      )}

      {tab === "completed" && (
        <div className="space-y-3">
          {completedJobs.map(j => (
            <div key={j.id} className="bg-white p-4 rounded-xl opacity-75">
              <div className="flex justify-between mb-2">
                <div>
                  <b>{j.title}</b>
                  <div className="text-sm text-gray-500">{j.properties?.name} {j.units?.name && `• ${j.units?.name}`}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-green-100">completed</span>
              </div>
              <p className="text-sm mt-1">{j.description}</p>
              {j.completed_at && (
                <div className="text-xs text-gray-500 mt-2">
                  ✅ Completed: {new Date(j.completed_at).toLocaleString()}
                </div>
              )}
              {(j.completed_photos || []).length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-2 flex-wrap">
                    {j.completed_photos.map((ph: string, i: number) => (
                      <a key={i} href={ph} target="_blank" className="text-green-600 text-xs underline">
                        Done {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {completedJobs.length === 0 && (
            <p className="text-gray-400">No completed jobs yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
