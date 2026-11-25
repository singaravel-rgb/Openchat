"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { adminApi, businessHoursApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type { BusinessHours, BusinessHoursCreate, BusinessHoursUpdate, Holiday, HolidayCreate, HolidayUpdate, BusinessOpenStatus } from "@/lib/types";

const DAYS_OF_WEEK = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

export default function BusinessHoursPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'hours' | 'holidays'>('hours');
  const [error, setError] = useState<string | null>(null);
  const [openStatus, setOpenStatus] = useState<BusinessOpenStatus | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BusinessHours | Holiday | null>(null);
  const [isEditingHoliday, setIsEditingHoliday] = useState(false);
  const [hoursFormData, setHoursFormData] = useState<BusinessHoursCreate>({
    day_of_week: 0,
    start_time: "09:00",
    end_time: "17:00",
    is_closed: false,
    is_active: true,
  });
  const [holidayFormData, setHolidayFormData] = useState<HolidayCreate>({
    name: "",
    holiday_date: "",
    is_recurring: false,
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [filterActive, setFilterActive] = useState<string>("all");
  const [bhTimezone, setBhTimezone] = useState("UTC");
  const [outOfHoursMsg, setOutOfHoursMsg] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user && user.role !== "admin" && user.role !== "super_admin") {
      router.push("/agent");
    }
  }, [user, authLoading, router]);

  const loadData = async () => {
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) return;

    setIsLoading(true);
    setError(null);
    try {
      const params: { is_active?: boolean } = {};
      if (filterActive !== "all") params.is_active = filterActive === "true";

      const [hoursData, holidaysData] = await Promise.all([
        businessHoursApi.list(params),
        businessHoursApi.listHolidays(params),
      ]);
      setBusinessHours(hoursData);
      setHolidays(holidaysData);

      const status = await businessHoursApi.checkOpen();
      setOpenStatus(status);

      try {
        const bhSettings = await adminApi.getSettings("business_hours");
        const tz = bhSettings.find((s) => s.key === "timezone")?.value;
        const msg = bhSettings.find((s) => s.key === "out_of_hours_message")?.value;
        if (tz) setBhTimezone(String(tz));
        if (msg) setOutOfHoursMsg(String(msg));
      } catch {
        // Fallback to status values
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterActive, user]);

  const handleOpenCreate = (isHoliday: boolean) => {
    setIsEditingHoliday(isHoliday);
    setEditingItem(null);
    if (isHoliday) {
      const today = new Date().toISOString().split("T")[0];
      setHolidayFormData({
        name: "",
        holiday_date: today,
        is_recurring: false,
        is_active: true,
      });
    } else {
      setHoursFormData({
        day_of_week: 0,
        start_time: "09:00",
        end_time: "17:00",
        is_closed: false,
        is_active: true,
      });
    }
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (item: BusinessHours | Holiday, isHoliday: boolean) => {
    setIsEditingHoliday(isHoliday);
    setEditingItem(item);
    if (isHoliday) {
      const holiday = item as Holiday;
      setHolidayFormData({
        name: holiday.name,
        holiday_date: holiday.holiday_date,
        is_recurring: holiday.is_recurring,
        is_active: holiday.is_active,
      });
    } else {
      const hours = item as BusinessHours;
      setHoursFormData({
        day_of_week: hours.day_of_week,
        start_time: hours.start_time,
        end_time: hours.end_time,
        is_closed: hours.is_closed,
        is_active: hours.is_active,
      });
    }
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (isEditingHoliday) {
        if (editingItem) {
          const updateData: HolidayUpdate = {
            name: holidayFormData.name,
            holiday_date: holidayFormData.holiday_date,
            is_recurring: holidayFormData.is_recurring,
            is_active: holidayFormData.is_active,
          };
          await businessHoursApi.updateHoliday(editingItem.id, updateData);
        } else {
          await businessHoursApi.createHoliday(holidayFormData);
        }
      } else {
        if (editingItem) {
          const updateData: BusinessHoursUpdate = {
            start_time: hoursFormData.start_time,
            end_time: hoursFormData.end_time,
            is_closed: hoursFormData.is_closed,
            is_active: hoursFormData.is_active,
          };
          await businessHoursApi.update(editingItem.id, updateData);
        } else {
          await businessHoursApi.create(hoursFormData);
        }
      }
      setShowModal(false);
      setEditingItem(null);
      loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, isHoliday: boolean) => {
    if (!window.confirm("Are you sure you want to delete this? This cannot be undone.")) return;

    try {
      if (isHoliday) {
        await businessHoursApi.deleteHoliday(id);
      } else {
        await businessHoursApi.delete(id);
      }
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleInputChange = (field: string, value: string | number | boolean) => {
    if (isEditingHoliday) {
      setHolidayFormData((prev) => ({ ...prev, [field]: value }));
    } else {
      setHoursFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Business Hours & Holidays</h1>
          <p className="text-gray-500 mt-1">Configure operating hours and holiday schedules</p>
        </div>
        <div className="flex gap-2">
          {openStatus && (
            <Badge variant={openStatus.is_open ? "success" : "default"}>
              {openStatus.is_open ? "Open" : "Closed"} - {openStatus.reason}
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Timezone & Out-of-Hours Response</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Operating Timezone (IANA)</label>
              <select
                value={bhTimezone}
                onChange={(e) => setBhTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="UTC">UTC</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom Out-of-Hours Customer Message</label>
              <Input
                value={outOfHoursMsg}
                onChange={(e) => setOutOfHoursMsg(e.target.value)}
                placeholder="We are currently outside business hours..."
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              disabled={savingConfig}
              onClick={async () => {
                setSavingConfig(true);
                setConfigSaved(false);
                try {
                  await adminApi.bulkUpdateSettings("business_hours", {
                    timezone: bhTimezone,
                    out_of_hours_message: outOfHoursMsg,
                  });
                  setConfigSaved(true);
                  const st = await businessHoursApi.checkOpen();
                  setOpenStatus(st);
                  setTimeout(() => setConfigSaved(false), 3000);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to save settings");
                } finally {
                  setSavingConfig(false);
                }
              }}
            >
              {savingConfig ? "Saving..." : "Save Schedule Settings"}
            </Button>
            {configSaved && <span className="text-xs text-emerald-600 font-medium">Saved!</span>}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 mb-4">
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-4 -mb-px" aria-label="Business Hours and Holidays tabs">
          <button
            onClick={() => setActiveTab('hours')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'hours' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Business Hours ({businessHours.filter((bh) => filterActive === 'all' || bh.is_active === (filterActive === 'true')).length})
          </button>
          <button
            onClick={() => setActiveTab('holidays')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'holidays' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Holidays ({holidays.filter((h) => filterActive === 'all' || h.is_active === (filterActive === 'true')).length})
          </button>
        </nav>
      </div>

      {activeTab === 'hours' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Business Hours</CardTitle>
            <Button onClick={() => handleOpenCreate(false)} className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Hours
            </Button>
          </CardHeader>
          <CardContent>
            {businessHours.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900">No business hours configured</h3>
                <p className="text-gray-500 mt-1">Add business hours for each day of the week</p>
              </div>
            ) : (
              <div className="space-y-2">
                {DAYS_OF_WEEK.map((day) => {
                  const hours = businessHours.find((bh) => bh.day_of_week === day.value);
                  const isFiltered = filterActive !== 'all' && hours && hours.is_active !== (filterActive === 'true');
                  if (!hours || isFiltered) return null;

                  return (
                    <div key={day.value} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-24 font-medium text-gray-900">{day.label}</div>
                        {hours.is_closed ? (
                          <Badge variant="default">Closed</Badge>
                        ) : (
                          <>
                            <Badge variant="default">
                              {hours.start_time} - {hours.end_time}
                            </Badge>
                            <Badge variant={hours.is_active ? "success" : "default"}>
                              {hours.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenEdit(hours, false)}>
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(hours.id, false)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'holidays' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Holidays</CardTitle>
            <Button onClick={() => handleOpenCreate(true)} className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Holiday
            </Button>
          </CardHeader>
          <CardContent>
            {holidays.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900">No holidays configured</h3>
                <p className="text-gray-500 mt-1">Add holidays when the business will be closed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {holidays
                  .filter((h) => filterActive === 'all' || h.is_active === (filterActive === 'true'))
                  .map((holiday) => (
                    <div key={holiday.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-medium text-gray-900">{holiday.name}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(holiday.holiday_date).toLocaleDateString()}
                            {holiday.is_recurring && <span className="ml-2 text-xs text-blue-600">(Recurring)</span>}
                          </div>
                        </div>
                        <Badge variant={holiday.is_active ? "success" : "default"}>
                          {holiday.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenEdit(holiday, true)}>
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(holiday.id, true)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingItem ? (isEditingHoliday ? "Edit Holiday" : "Edit Business Hours") : (isEditingHoliday ? "New Holiday" : "New Business Hours")}
              </h2>
              <Button variant="ghost" size="sm" onClick={handleCloseModal} className="p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}

              {isEditingHoliday ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <Input
                      type="text"
                      value={holidayFormData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      required
                      placeholder="e.g., Christmas Day"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <Input
                      type="date"
                      value={holidayFormData.holiday_date}
                      onChange={(e) => handleInputChange("holiday_date", e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_recurring"
                      checked={holidayFormData.is_recurring}
                      onChange={(e) => handleInputChange("is_recurring", e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="is_recurring" className="ml-2 text-sm text-gray-700">
                      Recurring (every year)
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week *</label>
                    <select
                      value={hoursFormData.day_of_week}
                      onChange={(e) => handleInputChange("day_of_week", parseInt(e.target.value, 10))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {DAYS_OF_WEEK.map((day) => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                      <Input
                        type="time"
                        value={hoursFormData.start_time}
                        onChange={(e) => handleInputChange("start_time", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                      <Input
                        type="time"
                        value={hoursFormData.end_time}
                        onChange={(e) => handleInputChange("end_time", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_closed"
                      checked={hoursFormData.is_closed}
                      onChange={(e) => handleInputChange("is_closed", e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="is_closed" className="ml-2 text-sm text-gray-700">
                      Closed all day
                    </label>
                  </div>
                </>
              )}

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={isEditingHoliday ? holidayFormData.is_active : hoursFormData.is_active}
                  onChange={(e) => handleInputChange("is_active", e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                  Active
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}