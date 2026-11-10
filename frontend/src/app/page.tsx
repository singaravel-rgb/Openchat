"use client";

import { useEffect, useState } from "react";

type ApiStatus = {
  status: string;
  service: string;
};

export default function Home() {
  const [apiStatus, setApiStatus] = useState("Checking...");
  const [dbStatus, setDbStatus] = useState("Checking...");
  const [redisStatus, setRedisStatus] = useState("Checking...");

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;

    async function checkService(
      endpoint: string,
      updateStatus: (value: string) => void
    ) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/${endpoint}`);

        if (!response.ok) throw new Error("Service unavailable");

        const data: ApiStatus = await response.json();
        updateStatus(data.status === "ok" ? "Connected" : "Unavailable");
      } catch {
        updateStatus("Unavailable");
      }
    }

    checkService("health", setApiStatus);
    checkService("health/db", setDbStatus);
    checkService("health/redis", setRedisStatus);
  }, []);

  const services = [
    { name: "Backend API", status: apiStatus },
    { name: "PostgreSQL", status: dbStatus },
    { name: "Redis", status: redisStatus },
  ];

  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold">OpenChat</h1>
        <p className="mt-2 text-slate-400">
          AI-powered customer support platform
        </p>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.name}
              className="rounded-xl border border-slate-800 bg-slate-900 p-6"
            >
              <h2 className="font-semibold">{service.name}</h2>
              <p className="mt-3 text-sm text-emerald-400">
                {service.status}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
