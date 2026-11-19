"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { customFieldApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Badge } from "@/components/Badge";
import type { CustomField, CustomFieldCreate, CustomFieldUpdate } from "@/lib/types";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "dropdown", label: "Dropdown" },
];

export default function CustomFieldsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState<CustomFieldCreate>({
    name: "",
    field_key: "",
    field_type: "text",
    options: null,
    is_required: false,
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [filterActive, setFilterActive] = useState<string>("all");

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

      const data = await customFieldApi.list(params);
      setFields(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load custom fields");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterActive, user]);

  const handleOpenCreate = () => {
    setEditingField(null);
    setFormData({
      name: "",
      field_key: "",
      field_type: "text",
      options: null,
      is_required: false,
      is_active: true,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (field: CustomField) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      field_key: field.field_key,
      field_type: field.field_type,
      options: field.options,
      is_required: field.is_required,
      is_active: field.is_active,
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingField(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (editingField) {
        const updateData: CustomFieldUpdate = {
          name: formData.name,
          field_type: formData.field_type,
          options: formData.options || null,
          is_required: formData.is_required,
          is_active: formData.is_active,
        };
        await customFieldApi.update(editingField.id, updateData);
      } else {
        await customFieldApi.create(formData);
      }
      setShowModal(false);
      setEditingField(null);
      loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (field: CustomField) => {
    if (!window.confirm(`Delete "${field.name}"? This cannot be undone.`)) return;

    try {
      await customFieldApi.delete(field.id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleInputChange = (field: keyof CustomFieldCreate, value: string | boolean | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
          <h1 className="text-2xl font-semibold text-gray-900">Custom Fields</h1>
          <p className="text-gray-500 mt-1">Manage custom fields for conversations</p>
        </div>
        <Button onClick={handleOpenCreate} className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Field
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Options
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Required
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {fields.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No custom fields found. Create your first one!
                    </td>
                  </tr>
                ) : (
                  fields.map((field) => (
                    <tr key={field.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{field.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono text-gray-700">
                          {field.field_key}
                        </code>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="default">
                          {field.field_type.charAt(0).toUpperCase() + field.field_type.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {field.options ? (
                          <span className="text-sm text-gray-500 max-w-xs truncate block">
                            {field.options.slice(0, 50)}{field.options.length > 50 ? "..." : ""}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {field.is_required ? (
                          <Badge variant="warning">Yes</Badge>
                        ) : (
                          <Badge variant="default">No</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={field.is_active ? "success" : "default"}>
                          {field.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(field.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(field)}
                            className="p-2"
                            aria-label="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(field)}
                            className="p-2 text-red-600 hover:bg-red-50"
                            aria-label="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingField ? "Edit Custom Field" : "New Custom Field"}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  required
                  placeholder="e.g., Priority Level"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field Key *</label>
                <Input
                  type="text"
                  value={formData.field_key}
                  onChange={(e) => handleInputChange("field_key", e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  required
                  placeholder="e.g., priority_level"
                  className="font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Lowercase, underscores only. Used for API references.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field Type *</label>
                <select
                  value={formData.field_type}
                  onChange={(e) => handleInputChange("field_type", e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Options (JSON)</label>
                <textarea
                  value={formData.options || ""}
                  onChange={(e) => handleInputChange("options", e.target.value || null)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder='For dropdown type: ["Option 1", "Option 2", "Option 3"]'
                />
                <p className="mt-1 text-xs text-gray-500">Required for dropdown type. JSON array of string values.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_required"
                    checked={formData.is_required}
                    onChange={(e) => handleInputChange("is_required", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_required" className="ml-2 text-sm text-gray-700">
                    Required field
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => handleInputChange("is_active", e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                    Active (available for use)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button type="button" variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : editingField ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}