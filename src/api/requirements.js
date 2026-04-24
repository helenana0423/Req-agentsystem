// src/api/requirements.js
// 业务数据 API（需求 / 进展 / 阻塞 / 依赖 / 甘特计算）

import { api } from './client.js';

// ===== 基础配置 =====
export async function fetchConfig() {
  return api.get('/config');
}

// ===== 需求 =====
export async function fetchRequirements(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  });
  const query = qs.toString();
  return api.get(`/requirements${query ? '?' + query : ''}`);
}

export async function createRequirement(data) {
  return api.post('/requirements', data);
}

export async function updateRequirementApi(id, patch) {
  return api.put(`/requirements/${id}`, patch);
}

export async function deleteRequirementApi(id) {
  return api.del(`/requirements/${id}`);
}

export async function fetchChanges(requirementId) {
  return api.get(`/requirements/${requirementId}/changes`);
}

// ===== 进展 =====
export async function fetchProgressNotes(requirementId) {
  return api.get(`/requirements/${requirementId}/progress`);
}

export async function createProgressNote(requirementId, note) {
  return api.post(`/requirements/${requirementId}/progress`, note);
}

export async function deleteProgressNoteApi(noteId) {
  return api.del(`/progress/${noteId}`);
}

// ===== 阻塞 =====
export async function fetchBlockers(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  });
  const query = qs.toString();
  return api.get(`/blockers${query ? '?' + query : ''}`);
}

export async function createBlockerApi(data) {
  return api.post('/blockers', data);
}

export async function resolveBlockerApi(id, resolvedNote) {
  return api.patch(`/blockers/${id}/resolve`, { resolved_note: resolvedNote });
}

// ===== 依赖 =====
export async function fetchDependencies() {
  return api.get('/dependencies');
}

export async function createDependencyApi(data) {
  return api.post('/dependencies', data);
}

export async function deleteDependencyApi(id) {
  return api.del(`/dependencies/${id}`);
}

// ===== 甘特计算 =====
export async function propagateDelayApi(requirementId, newEndDate) {
  return api.post('/gantt/propagate-delay', {
    requirement_id: requirementId,
    new_end_date: newEndDate,
  });
}

export async function fetchCriticalPath() {
  return api.get('/gantt/critical-path');
}
