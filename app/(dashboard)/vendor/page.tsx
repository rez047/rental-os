"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { addMaintenancePhoto } from "@/lib/actions";
import FileUploader from "@/components/FileUploader";

export default function VendorPortal() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<any[]>([]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from("maintenance_requests")
      .select("*, units(*), properties(*)").eq("assigned_vendor_user_id", user!.id);
    setJobs(data || []);
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: string) {
    await supabase.from("maintenance_requests").update({ status }).eq("id", id);
    load();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">My Jobs</h1>
      <div className="space-y-3">
        {jobs.map(j => (
          <div key={j.id} className="bg-white p-4 rounded-xl">
            <div className="flex justify-between mb-2">
              <b>{j.title}</b>
              <span className={`text-xs px-2 py-1 rounded ${
                j.status === "completed" ? "bg-green-100" :
                j.status === "in_progress" ? "bg-blue-100" : "bg-yellow-100"
              }`}>{j.status}</span>
            </div>
            <p className="text-sm text-gray-600">{j.properties?.name} - {j.units?.name}</p>
            <p className="text-sm mt-1">{j.description}</p>
            <div className="flex gap-2 mt-3">
              {j.status === "open" && <button onClick={() => updateStatus(j.id, "in_progress")} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Start Job</button>}
              {j.status === "in_progress" && <button onClick={() => updateStatus(j.id, "completed")} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Mark Complete</button>}
              <FileUploader folder="vendor" mode="image-video"
                onUploaded={async (meta) => { await addMaintenancePhoto(j.id, meta.file); load(); }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}