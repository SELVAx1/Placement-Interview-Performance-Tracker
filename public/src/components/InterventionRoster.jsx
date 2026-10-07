function InterventionRoster({ user, canGenerate = true, title = 'All Student Interventions', description = 'Review, trigger AI diagnostic remediation plans, and manage action items for students.' }) {
    const [students, setStudents] = React.useState([]);
    const [expandedStudentId, setExpandedStudentId] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [refreshing, setRefreshing] = React.useState(false);
    const [generatingStudentId, setGeneratingStudentId] = React.useState(null);
    const [generatingAll, setGeneratingAll] = React.useState(false);
    const [error, setError] = React.useState('');
    const [successMsg, setSuccessMsg] = React.useState('');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('ALL'); // 'ALL' | 'ACTIVE' | 'RESOLVED' | 'NO_PLAN'

    // Add action task states for existing interventions
    const [addingActionForIv, setAddingActionForIv] = React.useState(null);
    const [newActionTitle, setNewActionTitle] = React.useState('');
    const [newActionWeakness, setNewActionWeakness] = React.useState('');
    const [newActionResource, setNewActionResource] = React.useState('');
    const [newActionDueDate, setNewActionDueDate] = React.useState('');

    // Custom intervention modal states
    const [isCustomModalOpen, setIsCustomModalOpen] = React.useState(false);
    const [customStudentGmail, setCustomStudentGmail] = React.useState('');
    const [customTitle, setCustomTitle] = React.useState('');
    const [customSummary, setCustomSummary] = React.useState('');
    const [customAnalysis, setCustomAnalysis] = React.useState('');
    const [customPriority, setCustomPriority] = React.useState('MEDIUM');
    const [customActions, setCustomActions] = React.useState([
        { title: 'Review core domain fundamentals with mentor', weakness_area: 'Technical Concepts', resources: 'Department LMS & Reference Docs', due_date: 'Within 7 days' }
    ]);
    const [savingCustom, setSavingCustom] = React.useState(false);

    const showSuccess = (msg) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 4000);
    };

    const loadStudents = React.useCallback(async (showLoader = false) => {
        if (showLoader) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setError('');
        try {
            const response = await fetch('/api/interventions/students', {
                headers: window.interventionHeaders(user)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Unable to load intervention students.');
            }
            setStudents(data.students || []);
        } catch (loadError) {
            setError(loadError.message);
        } finally {
            if (showLoader) {
                setLoading(false);
            } else {
                setRefreshing(false);
            }
        }
    }, [user]);

    React.useEffect(() => {
        loadStudents(true);
    }, [loadStudents]);

    const openCustomModal = (student = null) => {
        setCustomStudentGmail(student ? student.gmail : '');
        setCustomTitle(student ? `Targeted Remediation Plan - ${student.name || student.gmail}` : '');
        setCustomSummary('');
        setCustomAnalysis('');
        setCustomPriority('MEDIUM');
        setCustomActions([
            { title: 'Review core domain fundamentals with mentor', weakness_area: 'Technical Concepts', resources: 'Department LMS & Reference Docs', due_date: 'Within 7 days' }
        ]);
        setIsCustomModalOpen(true);
    };

    const handleAddCustomActionRow = () => {
        setCustomActions(prev => [
            ...prev,
            { title: '', weakness_area: '', resources: '', due_date: '' }
        ]);
    };

    const handleRemoveCustomActionRow = (index) => {
        setCustomActions(prev => prev.filter((_, i) => i !== index));
    };

    const handleCustomActionChange = (index, field, value) => {
        setCustomActions(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const generateForStudent = async (student) => {
        setGeneratingStudentId(student.uuid || student.student_id);
        setError('');
        try {
            const response = await fetch('/api/interventions/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({
                    student_id: student.uuid || student.student_id,
                    gmail: student.gmail
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Unable to generate intervention.');
            }
            await loadStudents(false);
            setExpandedStudentId(student.uuid || student.student_id);
            showSuccess(`Generated AI intervention plan for ${student.name || student.gmail}.`);
        } catch (generationError) {
            setError(generationError.message);
        } finally {
            setGeneratingStudentId(null);
        }
    };

    const generateForAll = async () => {
        setGeneratingAll(true);
        setError('');
        try {
            const response = await fetch('/api/interventions/generate-all', {
                method: 'POST',
                headers: window.interventionHeaders(user)
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Unable to generate interventions.');
            }
            await loadStudents(false);
            showSuccess(`Generated AI intervention plans for ${data.generated?.length || 0} student(s).`);
        } catch (generationError) {
            setError(generationError.message);
        } finally {
            setGeneratingAll(false);
        }
    };

    const updateAction = async (action) => {
        try {
            const res = await fetch(`/api/interventions/actions/${action.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({
                    completed: !action.completed,
                    notes: action.notes || ''
                })
            });
            if (res.ok) {
                await loadStudents(false);
            }
        } catch (err) {
            setError('Failed to update action.');
        }
    };

    const updateStatus = async (interventionId, newStatus) => {
        try {
            const res = await fetch(`/api/interventions/${interventionId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                await loadStudents(false);
                showSuccess(`Updated intervention status to ${newStatus}.`);
            }
        } catch (err) {
            setError('Failed to update intervention status.');
        }
    };

    const handleAppendAction = async (interventionId) => {
        if (!newActionTitle.trim()) return;
        try {
            const res = await fetch(`/api/interventions/${interventionId}/actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({
                    title: newActionTitle.trim(),
                    weakness_area: newActionWeakness.trim() || undefined,
                    resources: newActionResource.trim() || undefined,
                    due_date: newActionDueDate.trim() || undefined
                })
            });
            if (res.ok) {
                await loadStudents(false);
                setAddingActionForIv(null);
                setNewActionTitle('');
                setNewActionWeakness('');
                setNewActionResource('');
                setNewActionDueDate('');
                showSuccess('Added new action task.');
            } else {
                const data = await res.json();
                setError(data.detail || 'Failed to add action.');
            }
        } catch (err) {
            setError('Failed to add action item.');
        }
    };

    const handleDeleteIntervention = async (interventionId) => {
        if (!window.confirm('Are you sure you want to remove this intervention?')) return;
        try {
            const res = await fetch(`/api/interventions/${interventionId}`, {
                method: 'DELETE',
                headers: window.interventionHeaders(user)
            });
            if (res.ok) {
                await loadStudents(false);
                showSuccess('Intervention removed.');
            } else {
                const data = await res.json();
                setError(data.detail || 'Failed to remove intervention.');
            }
        } catch (err) {
            setError('Failed to remove intervention.');
        }
    };

    const handleCreateCustom = async (e) => {
        e.preventDefault();
        if (!customStudentGmail.trim() || !customTitle.trim()) {
            setError('Please enter a valid student email and title.');
            return;
        }
        setSavingCustom(true);
        setError('');
        try {
            const validActions = customActions
                .filter(act => act.title && act.title.trim())
                .map(act => ({
                    title: act.title.trim(),
                    weakness_area: (act.weakness_area || '').trim() || undefined,
                    resources: (act.resources || '').trim() || undefined,
                    due_date: (act.due_date || '').trim() || undefined
                }));

            const res = await fetch('/api/interventions/custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...window.interventionHeaders(user) },
                body: JSON.stringify({
                    gmail: customStudentGmail.trim(),
                    title: customTitle.trim(),
                    failure_summary: customSummary.trim(),
                    ai_analysis: customAnalysis.trim(),
                    priority: customPriority,
                    actions: validActions.length > 0 ? validActions : [
                        {
                            title: 'Review foundational concepts with mentor',
                            weakness_area: 'Core Fundamentals',
                            resources: 'Department Library & LMS',
                            due_date: 'Within 2 weeks'
                        }
                    ]
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                await loadStudents(false);
                setIsCustomModalOpen(false);
                setCustomTitle('');
                setCustomSummary('');
                setCustomAnalysis('');
                setCustomStudentGmail('');
                showSuccess('Custom intervention created successfully.');
            } else {
                setError(data.detail || 'Failed to create custom intervention.');
            }
        } catch (err) {
            setError('Failed to create custom intervention.');
        } finally {
            setSavingCustom(false);
        }
    };

    // Filter students
    const filteredStudents = students.filter(s => {
        const matchSearch =
            (s.gmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.department || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.register_number || '').toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchSearch) return false;

        const ivCount = (s.interventions || []).length;
        if (statusFilter === 'NO_PLAN') return ivCount === 0;
        if (statusFilter === 'ACTIVE') return ivCount > 0 && s.interventions.some(i => i.status !== 'RESOLVED' && i.status !== 'COMPLETED');
        if (statusFilter === 'RESOLVED') return ivCount > 0 && s.interventions.every(i => i.status === 'RESOLVED' || i.status === 'COMPLETED');
        return true;
    });

    return (
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(15,23,42,0.04)' }}>
            {/* Header section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                    <h3 style={{ color: '#0f172a', fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{title}</span>
                        <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '12px', fontWeight: '700' }}>
                            {students.length} Total Students
                        </span>
                    </h3>
                    <p style={{ color: '#475569', fontSize: '0.875rem', margin: '6px 0 0' }}>{description}</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => loadStudents(false)}
                        style={{ padding: '8px 14px', borderRadius: '7px', background: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600' }}
                    >
                        {refreshing ? 'Refreshing...' : '↻ Refresh'}
                    </button>
                    {canGenerate && (
                        <>
                            <button
                                type="button"
                                onClick={() => openCustomModal()}
                                style={{ padding: '8px 14px', borderRadius: '7px', background: '#b45309', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem', boxShadow: '0 2px 6px rgba(180,83,9,0.3)' }}
                            >
                                + Custom Intervention
                            </button>
                            <button
                                type="button"
                                onClick={generateForAll}
                                disabled={generatingAll || loading || students.length === 0}
                                style={{ padding: '8px 16px', borderRadius: '7px', background: 'linear-gradient(135deg, #0f766e, #0d9488)', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem', boxShadow: '0 4px 12px rgba(15,118,110,0.3)' }}
                            >
                                {generatingAll ? 'Synthesizing All AI Plans...' : '⚡ Generate All AI Plans'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search by student name, email, department, or reg no..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ flex: 1, minWidth: '260px', padding: '9px 14px', borderRadius: '8px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: '9px 14px', borderRadius: '8px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: '500' }}
                >
                    <option value="ALL">All Cohort ({students.length})</option>
                    <option value="ACTIVE">Active Interventions</option>
                    <option value="RESOLVED">Resolved / Completed</option>
                    <option value="NO_PLAN">No Plan Yet</option>
                </select>
            </div>

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.85rem' }}>{error}</div>}
            {successMsg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.85rem' }}>{successMsg}</div>}

            {loading ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>Loading authorized student cohort...</p>
            ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <p style={{ margin: 0 }}>No students match your filter criteria.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filteredStudents.map(student => {
                        const sId = student.uuid || student.student_id;
                        const expanded = expandedStudentId === sId;
                        const ivs = student.interventions || [];
                        const isGenerating = generatingStudentId === sId;

                        return (
                            <div key={sId || student.gmail} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 18px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setExpandedStudentId(expanded ? null : sId)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px', textAlign: 'left', background: 'transparent', color: '#0f172a', border: 'none', cursor: 'pointer' }}
                                    >
                                        <span style={{ color: '#0f766e', fontSize: '1.2rem', fontWeight: 'bold' }}>{expanded ? '−' : '+'}</span>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{student.name || student.gmail}</strong>
                                                {student.register_number && (
                                                    <span style={{ fontSize: '0.75rem', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                                                        {student.register_number}
                                                    </span>
                                                )}
                                            </div>
                                            <small style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                                {student.gmail} · {student.department || 'CSE'} {student.year ? `· ${student.year}` : ''} · <strong>{ivs.length}</strong> intervention plan(s)
                                            </small>
                                        </div>
                                    </button>

                                    {canGenerate && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => openCustomModal(student)}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: '6px',
                                                    background: '#ffffff',
                                                    color: '#b45309',
                                                    border: '1px solid #d97706',
                                                    cursor: 'pointer',
                                                    fontWeight: '600',
                                                    fontSize: '0.8rem',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <span>+ Custom Plan</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => generateForStudent(student)}
                                                disabled={isGenerating}
                                                style={{
                                                    padding: '7px 14px',
                                                    borderRadius: '6px',
                                                    background: isGenerating ? '#cbd5e1' : '#0f766e',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    cursor: isGenerating ? 'wait' : 'pointer',
                                                    fontWeight: '600',
                                                    fontSize: '0.8rem',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}
                                            >
                                                <span>⚡</span>
                                                <span>{isGenerating ? 'Synthesizing...' : 'Trigger AI Plan'}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {expanded && (
                                    <div style={{ borderTop: '1px solid #e2e8f0', padding: '18px', background: '#f8fafc' }}>
                                        {ivs.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', background: '#ffffff', borderRadius: '8px', border: '1px border #e2e8f0' }}>
                                                <p style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>No intervention generated for this student yet.</p>
                                                {canGenerate && (
                                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => openCustomModal(student)}
                                                            style={{ padding: '6px 14px', borderRadius: '6px', background: '#b45309', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
                                                        >
                                                            + Custom Intervention Plan
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => generateForStudent(student)}
                                                            disabled={isGenerating}
                                                            style={{ padding: '6px 14px', borderRadius: '6px', background: '#0f766e', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
                                                        >
                                                            ⚡ Generate First AI Plan
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            ivs.map(intervention => {
                                                const priorityBg = intervention.priority === 'HIGH' ? '#fee2e2' : intervention.priority === 'LOW' ? '#d1fae5' : '#fef3c7';
                                                const priorityColor = intervention.priority === 'HIGH' ? '#b91c1c' : intervention.priority === 'LOW' ? '#047857' : '#b45309';

                                                return (
                                                    <div key={intervention.id} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '16px', borderRadius: '8px', marginBottom: '14px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <strong style={{ color: '#0f172a', fontSize: '1rem' }}>{intervention.title}</strong>
                                                                    <span style={{ fontSize: '0.72rem', background: priorityBg, color: priorityColor, padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>
                                                                        Priority: {intervention.priority}
                                                                    </span>
                                                                </div>
                                                                {intervention.failure_summary && (
                                                                    <p style={{ color: '#991b1b', fontSize: '0.84rem', margin: '8px 0 0', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '6px' }}>
                                                                        <strong>Diagnostic Summary:</strong> {intervention.failure_summary}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                {canGenerate && (
                                                                    <>
                                                                        <select
                                                                            value={intervention.status}
                                                                            onChange={(e) => updateStatus(intervention.id, e.target.value)}
                                                                            style={{ height: '32px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', padding: '0 8px', fontWeight: '600' }}
                                                                        >
                                                                            <option value="OPEN">OPEN</option>
                                                                            <option value="IN_PROGRESS">IN PROGRESS</option>
                                                                            <option value="COMPLETED">COMPLETED</option>
                                                                            <option value="RESOLVED">RESOLVED</option>
                                                                            <option value="CANCELLED">CANCELLED</option>
                                                                        </select>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteIntervention(intervention.id)}
                                                                            title="Delete intervention"
                                                                            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', padding: '5px 8px', borderRadius: '6px' }}
                                                                        >
                                                                            🗑
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {intervention.ai_analysis && (
                                                            <p style={{ color: '#0369a1', fontSize: '0.84rem', margin: '10px 0', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '8px 12px', borderRadius: '6px' }}>
                                                                <strong>Remediation Strategy:</strong> {intervention.ai_analysis}
                                                            </p>
                                                        )}

                                                        {/* Checklist */}
                                                        <div style={{ marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                <small style={{ color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                    Action Checklist ({((intervention.actions || []).filter(a => a.completed)).length}/{(intervention.actions || []).length} Done)
                                                                </small>
                                                                {canGenerate && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setAddingActionForIv(addingActionForIv === intervention.id ? null : intervention.id)}
                                                                        style={{ background: 'transparent', color: '#0f766e', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700' }}
                                                                    >
                                                                        {addingActionForIv === intervention.id ? '✕ Cancel' : '+ Add Task'}
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {addingActionForIv === intervention.id && (
                                                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Task title (e.g. Solve 20 Dynamic Programming questions)"
                                                                        value={newActionTitle}
                                                                        onChange={(e) => setNewActionTitle(e.target.value)}
                                                                        style={{ padding: '8px 12px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                                                    />
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Weakness area"
                                                                            value={newActionWeakness}
                                                                            onChange={(e) => setNewActionWeakness(e.target.value)}
                                                                            style={{ padding: '7px 10px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Resource / Material"
                                                                            value={newActionResource}
                                                                            onChange={(e) => setNewActionResource(e.target.value)}
                                                                            style={{ padding: '7px 10px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Due date (e.g. 7 Days)"
                                                                            value={newActionDueDate}
                                                                            onChange={(e) => setNewActionDueDate(e.target.value)}
                                                                            style={{ padding: '7px 10px', borderRadius: '6px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleAppendAction(intervention.id)}
                                                                            style={{ padding: '6px 14px', borderRadius: '6px', background: '#0f766e', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}
                                                                        >
                                                                            Save Action Task
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {(intervention.actions || []).map(action => (
                                                                    <label key={action.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: action.completed ? '#64748b' : '#0f172a', fontSize: '0.85rem', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={Boolean(action.completed)}
                                                                            disabled={!canGenerate}
                                                                            onChange={() => canGenerate && updateAction(action)}
                                                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                                        />
                                                                        <span style={{ textDecoration: action.completed ? 'line-through' : 'none', flex: 1, fontWeight: '500' }}>{action.title}</span>
                                                                        {action.weakness_area && (
                                                                            <span style={{ fontSize: '0.72rem', color: '#475569', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{action.weakness_area}</span>
                                                                        )}
                                                                        {action.due_date && (
                                                                            <span style={{ fontSize: '0.72rem', color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>📅 {action.due_date}</span>
                                                                        )}
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal: Create Custom Intervention */}
            {isCustomModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCustomModalOpen(false)}>
                    <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%' }}>
                        <div className="modal-head" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                            <div className="head-text">
                                <h3 style={{ color: '#0f172a', margin: 0, fontSize: '1.2rem' }}>Create Custom Intervention Plan</h3>
                                <p className="modal-sub" style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Define a custom remediation strategy with targeted action items for any student.</p>
                            </div>
                            <button type="button" className="close-btn" onClick={() => setIsCustomModalOpen(false)} style={{ fontSize: '1.5rem', color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer' }}>×</button>
                        </div>

                        <form onSubmit={handleCreateCustom} className="modal-form-content" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div className="form-group">
                                <label className="form-label" style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Student Gmail / Email *</label>
                                <input
                                    type="email"
                                    required
                                    className="input-text"
                                    placeholder="e.g. rahul.sharma@college.edu"
                                    value={customStudentGmail}
                                    onChange={(e) => setCustomStudentGmail(e.target.value)}
                                    list="student-emails-list"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.9rem' }}
                                />
                                <datalist id="student-emails-list">
                                    {students.map(s => <option key={s.gmail} value={s.gmail}>{s.name ? `${s.name} (${s.gmail})` : s.gmail}</option>)}
                                </datalist>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                    <label className="form-label" style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Intervention Title *</label>
                                    <input
                                        type="text"
                                        required
                                        className="input-text"
                                        placeholder="e.g. Intensive DSA Sprint & System Design Bootcamp"
                                        value={customTitle}
                                        onChange={(e) => setCustomTitle(e.target.value)}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.9rem' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Priority</label>
                                    <select
                                        className="input-text"
                                        value={customPriority}
                                        onChange={(e) => setCustomPriority(e.target.value)}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.9rem', fontWeight: '600' }}
                                    >
                                        <option value="HIGH">HIGH (Urgent)</option>
                                        <option value="MEDIUM">MEDIUM (Moderate)</option>
                                        <option value="LOW">LOW (Standard)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Diagnostic Failure Summary</label>
                                <textarea
                                    className="input-text"
                                    rows="2"
                                    placeholder="e.g. Needs improvement in Technical Interview Round 2 on algorithms & data structures."
                                    value={customSummary}
                                    onChange={(e) => setCustomSummary(e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.88rem' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label" style={{ color: '#0f172a', fontWeight: '600', fontSize: '0.85rem', marginBottom: '6px', display: 'block' }}>Remediation Strategy / Analysis</label>
                                <textarea
                                    className="input-text"
                                    rows="2"
                                    placeholder="e.g. Assigned 1:1 mentor coaching, mock interviews, and weekly progress reviews."
                                    value={customAnalysis}
                                    onChange={(e) => setCustomAnalysis(e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.88rem' }}
                                />
                            </div>

                            {/* Dynamic Action Checklist builder */}
                            <div className="form-group" style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <label style={{ color: '#0f172a', fontWeight: '700', fontSize: '0.85rem' }}>Targeted Action Tasks ({customActions.length})</label>
                                    <button
                                        type="button"
                                        onClick={handleAddCustomActionRow}
                                        style={{ background: '#0f766e', color: '#ffffff', border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        + Add Action Task
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {customActions.map((action, idx) => (
                                        <div key={idx} style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    placeholder={`Task #${idx + 1} Title *`}
                                                    value={action.title}
                                                    onChange={(e) => handleCustomActionChange(idx, 'title', e.target.value)}
                                                    style={{ flex: 1, padding: '7px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.82rem' }}
                                                />
                                                {customActions.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveCustomActionRow(idx)}
                                                        style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.78rem' }}
                                                    >
                                                        🗑
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Weakness Area"
                                                    value={action.weakness_area}
                                                    onChange={(e) => handleCustomActionChange(idx, 'weakness_area', e.target.value)}
                                                    style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.78rem' }}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Resource / LMS Link"
                                                    value={action.resources}
                                                    onChange={(e) => handleCustomActionChange(idx, 'resources', e.target.value)}
                                                    style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.78rem' }}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Due Date"
                                                    value={action.due_date}
                                                    onChange={(e) => handleCustomActionChange(idx, 'due_date', e.target.value)}
                                                    style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.78rem' }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions-bar" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => setIsCustomModalOpen(false)}
                                    style={{ padding: '8px 16px', borderRadius: '6px', background: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-confirm"
                                    disabled={savingCustom}
                                    style={{ padding: '8px 18px', borderRadius: '6px', background: '#b45309', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', boxShadow: '0 2px 6px rgba(180,83,9,0.3)' }}
                                >
                                    {savingCustom ? 'Creating...' : 'Create Intervention Plan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
