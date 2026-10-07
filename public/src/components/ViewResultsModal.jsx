function ViewResultsModal({ isOpen, onClose, drive, onOpenUpload }) {
    if (!isOpen || !drive) return null;

    const [activeTab, setActiveTab] = React.useState('process'); // 'process' | 'selected' | 'all'
    const [processData, setProcessData] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [expandedRound, setExpandedRound] = React.useState(null);
    const [toastMessage, setToastMessage] = React.useState('');

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3500);
    };

    const fetchProcessData = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/drives/${drive.id}/process`);
            const data = await res.json();
            if (res.ok && data.success) {
                setProcessData(data);
            }
        } catch (err) {
            console.error('Failed to fetch drive process details:', err);
        } finally {
            setLoading(false);
        }
    }, [drive.id]);

    React.useEffect(() => {
        fetchProcessData();
    }, [fetchProcessData]);

    const rounds = processData?.rounds || [];
    const selectedStudents = processData?.selected_students || [];
    const summary = processData?.summary || {
        total_candidates: 0,
        total_rounds: rounds.length || 4,
        selected_count: 0,
        rejected_count: 0,
        in_progress_count: 0,
        selection_rate: 0
    };

    // Candidate list from all rounds
    const allResults = React.useMemo(() => {
        const list = [];
        const seen = new Set();
        rounds.forEach(r => {
            (r.students || []).forEach(s => {
                if (!seen.has(s.gmail)) {
                    seen.add(s.gmail);
                    list.push(s);
                }
            });
        });
        return list;
    }, [rounds]);

    const filteredCandidates = allResults.filter(r =>
        (r.gmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.student_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.result || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.department || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredSelected = selectedStudents.filter(r =>
        (r.gmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.student_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.register_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.department || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDownload = (url, fallbackName) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fallbackName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`Download started: ${fallbackName}`);
    };

    const downloadSelectedStudentsExcel = () => {
        const safeCompany = (drive.company_name || 'Company').toLowerCase().replace(/\s+/g, '_');
        handleDownload(
            `/api/drives/${drive.id}/export/selected`,
            `${safeCompany}_selected_students.xlsx`
        );
    };

    const downloadRoundTemplateExcel = (roundNumber) => {
        const safeCompany = (drive.company_name || 'Company').toLowerCase().replace(/\s+/g, '_');
        handleDownload(
            `/api/drives/${drive.id}/export/round/${roundNumber}/template`,
            `${safeCompany}_round_${roundNumber}_update_template.xlsx`
        );
    };

    const downloadAllResultsExcel = () => {
        const safeCompany = (drive.company_name || 'Company').toLowerCase().replace(/\s+/g, '_');
        handleDownload(
            `/api/export/drive-results/${drive.id}?format=xlsx`,
            `${safeCompany}_all_results.xlsx`
        );
    };

    const handleCandidateAction = async (studentEmail, action, roundNum = null) => {
        try {
            const res = await fetch(`/api/drives/${drive.id}/advance-candidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gmail: studentEmail,
                    action: action,
                    round_num: roundNum
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setToastMessage(data.message || 'Status updated successfully.');
                setTimeout(() => setToastMessage(''), 3500);
                fetchProcessData();
            } else {
                setToastMessage(data.detail || data.message || 'Action failed.');
                setTimeout(() => setToastMessage(''), 3500);
            }
        } catch (err) {
            console.error('Failed to update candidate:', err);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-dialog process-modal-dialog" onClick={(e) => e.stopPropagation()}>
                {/* Header Section */}
                <div className="modal-head">
                    <div className="process-header-info">
                        <div className="company-title-row">
                            <div className="company-avatar-box">
                                {(drive.company_name || 'C').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <div className="company-name-tag">
                                    <h3>{drive.company_name}</h3>
                                    <span className="badge-pill ctc-highlight">{drive.ctc_lpa} LPA</span>
                                    <span className={`status-badge ${drive.status ? drive.status.toLowerCase() : 'active'}`}>
                                        {drive.status || 'Active'}
                                    </span>
                                </div>
                                <p className="modal-sub">
                                    {drive.job_role} • Min CGPA: {drive.min_cgpa ? `${drive.min_cgpa}/10` : 'None'} • {drive.location || 'On Campus'}
                                </p>
                                {(drive.description || processData?.drive?.description) && (
                                    <p style={{ margin: '5px 0 0', fontSize: '0.82rem', color: '#94a3b8', lineHeight: '1.4' }}>
                                        {drive.description || processData?.drive?.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} title="Close Modal">&times;</button>
                </div>

                {/* Toast Bar */}
                {toastMessage && (
                    <div className="process-toast-bar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>{toastMessage}</span>
                    </div>
                )}

                {/* Company Pipeline KPI Stats Row */}
                <div className="company-kpi-bar">
                    <div className="kpi-mini-card">
                        <span className="kpi-label">Total Candidates</span>
                        <span className="kpi-value">{summary.total_candidates}</span>
                    </div>
                    <div className="kpi-mini-card">
                        <span className="kpi-label">Interview Pipeline</span>
                        <span className="kpi-value">{summary.total_rounds} Stages</span>
                    </div>
                    <div className="kpi-mini-card highlight-selected">
                        <span className="kpi-label">Students Selected</span>
                        <span className="kpi-value text-emerald">{summary.selected_count} Hired</span>
                    </div>
                    <div className="kpi-mini-card">
                        <span className="kpi-label">Selection Rate</span>
                        <span className="kpi-value">{summary.selection_rate}%</span>
                    </div>
                    <div className="kpi-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn-download-selected-excel"
                            onClick={downloadSelectedStudentsExcel}
                            title="Download complete Excel spreadsheet of all selected candidates with CTC & roles"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            Export Selected Excel ({summary.selected_count})
                        </button>
                        <button
                            type="button"
                            className="btn-download-all-excel"
                            onClick={downloadAllResultsExcel}
                            title="Download complete historical records of all candidates in this drive"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#93c5fd',
                                border: '1px solid rgba(59, 130, 246, 0.35)',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export All Results ({allResults.length})
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="process-tabs-nav">
                    <button
                        type="button"
                        className={`process-tab-btn ${activeTab === 'process' ? 'active' : ''}`}
                        onClick={() => setActiveTab('process')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="6" y1="3" x2="6" y2="15"></line>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                        </svg>
                        Interview Process Funnel ({rounds.length} Rounds)
                    </button>
                    <button
                        type="button"
                        className={`process-tab-btn ${activeTab === 'selected' ? 'active' : ''}`}
                        onClick={() => setActiveTab('selected')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Selected Students ({summary.selected_count})
                    </button>
                    <button
                        type="button"
                        className={`process-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        All Candidates ({allResults.length})
                    </button>
                </div>

                {/* Modal Body Container */}
                <div className="process-modal-body">
                    {loading ? (
                        <div className="panel-loading" style={{ padding: '60px' }}>
                            <div className="spinner-sm"></div>
                            <span>Analyzing recruitment pipeline and student round outcomes...</span>
                        </div>
                    ) : (
                        <>
                            {/* TAB 1: INTERVIEW PROCESS PIPELINE & ROUND-BY-ROUND TEMPLATES */}
                            {activeTab === 'process' && (
                                <div className="process-funnel-container">
                                    <div className="process-instructions-card">
                                        <div className="info-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"></circle>
                                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                            </svg>
                                        </div>
                                        <div>
                                            <h4>Company Interview Stages & Pre-Populated Update Templates</h4>
                                            <p>
                                                Below is the full evaluation sequence for <strong>{drive.company_name}</strong>. For each round, download the 
                                                <strong> Update Excel Template</strong> pre-populated with all students who cleared that stage to easily submit verdicts, scores, and advance candidates to the next round.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounds-pipeline-list">
                                        {rounds.map((r, idx) => {
                                            const isExpanded = expandedRound === r.round_number;
                                            return (
                                                <div key={r.round_id || idx} className="round-pipeline-card">
                                                    <div className="round-card-header">
                                                        <div className="round-title-group">
                                                            <div className="round-number-badge">
                                                                R{r.round_number}
                                                            </div>
                                                            <div>
                                                                <div className="round-header-top">
                                                                    <h4 className="round-name-title">{r.round_name}</h4>
                                                                    <span className="round-type-pill">{r.round_type || 'TECHNICAL'}</span>
                                                                    {idx === rounds.length - 1 && (
                                                                        <span className="final-round-pill">Final Round / Verdict</span>
                                                                    )}
                                                                </div>
                                                                <p className="round-description">{r.description}</p>
                                                            </div>
                                                        </div>

                                                        {/* Per-Round Update Template Download Buttons */}
                                                        <div className="round-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <button
                                                                type="button"
                                                                className="btn-download-round-template"
                                                                onClick={() => downloadRoundTemplateExcel(r.round_number)}
                                                                title={`Download evaluation template for Round ${r.round_number} (.xlsx)`}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                                    <polyline points="7 10 12 15 17 10"></polyline>
                                                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                                                </svg>
                                                                <span>Round {r.round_number} Template (.xlsx)</span>
                                                            </button>

                                                            {r.round_number < rounds.length && (
                                                                <button
                                                                    type="button"
                                                                    className="btn-advance-round-template"
                                                                    onClick={() => downloadRoundTemplateExcel(r.round_number + 1)}
                                                                    title={`Advance the students selected in Round ${r.round_number} to Round ${r.round_number + 1}'s evaluation template`}
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px',
                                                                        background: 'linear-gradient(135deg, #059669, #10b981)',
                                                                        color: '#ffffff',
                                                                        fontWeight: '600',
                                                                        fontSize: '0.8rem',
                                                                        padding: '8px 14px',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                                                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease'
                                                                    }}
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polyline points="13 17 18 12 13 7"></polyline>
                                                                        <polyline points="6 17 11 12 6 7"></polyline>
                                                                    </svg>
                                                                    <span>Advance to Round {r.round_number + 1} Template ({r.cleared_count > 0 ? `${r.cleared_count} Selected` : 'Next Stage'})</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Round Funnel Stats Badges */}
                                                    <div className="round-funnel-strip">
                                                        <div className="funnel-stat-item">
                                                            <span className="stat-label">Appeared in Round</span>
                                                            <span className="stat-val">{r.appeared_count}</span>
                                                        </div>
                                                        <div className="funnel-stat-arrow">→</div>
                                                        <div className="funnel-stat-item stat-cleared">
                                                            <span className="stat-label">Cleared / Selected</span>
                                                            <span className="stat-val">{r.cleared_count}</span>
                                                        </div>
                                                        <div className="funnel-stat-item stat-rejected">
                                                            <span className="stat-label">Rejected</span>
                                                            <span className="stat-val">{r.rejected_count}</span>
                                                        </div>
                                                        <div className="funnel-stat-item">
                                                            <span className="stat-label">Pass Rate</span>
                                                            <span className="stat-val">{r.pass_rate}%</span>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className="btn-toggle-roster"
                                                            onClick={() => setExpandedRound(isExpanded ? null : r.round_number)}
                                                        >
                                                            {isExpanded ? 'Hide Candidate List ▲' : `View Candidates (${r.appeared_count}) ▼`}
                                                        </button>
                                                    </div>

                                                    {/* Accordion Roster for this Round */}
                                                    {isExpanded && (
                                                        <div className="round-roster-expanded">
                                                            {r.students.length === 0 ? (
                                                                <div className="empty-round-roster">
                                                                    No candidates recorded for this round yet.
                                                                </div>
                                                            ) : (
                                                                <table className="enterprise-table compact-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Student Name</th>
                                                                            <th>Gmail</th>
                                                                            <th>Dept</th>
                                                                            <th>CGPA</th>
                                                                            <th>Score</th>
                                                                            <th>Status in Round {r.round_number}</th>
                                                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {r.students.map(s => {
                                                                            const isCleared = (s.round > r.round_number) || 
                                                                                              (r.cleared_students && r.cleared_students.some(cs => (cs.gmail || '').toLowerCase() === (s.gmail || '').toLowerCase()));
                                                                            const isRejected = (s.result || '').toLowerCase().includes('reject') || (s.result || '').toLowerCase().includes('fail');
                                                                            const isFinalStage = (r.round_number === rounds.length);

                                                                            return (
                                                                                <tr key={s.id || s.gmail}>
                                                                                    <td className="font-semibold">{s.student_name}</td>
                                                                                    <td>{s.gmail}</td>
                                                                                    <td>{s.department || 'CSE'}</td>
                                                                                    <td>{s.cgpa ? s.cgpa.toFixed(1) : 'N/A'}</td>
                                                                                    <td>{s.score !== null && s.score !== undefined ? s.score : '—'}</td>
                                                                                    <td>
                                                                                        {isRejected ? (
                                                                                            <span className="res-badge-pill" style={{ background: 'rgba(239,68,68,0.18)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                                                                                Rejected in Round {r.round_number}
                                                                                            </span>
                                                                                        ) : isCleared ? (
                                                                                            <span className="res-badge-pill" style={{ background: 'rgba(16,185,129,0.18)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                                                                                                {isFinalStage ? 'Selected / Hired 🏆' : `Cleared Stage • In Round ${r.round_number + 1}`}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="res-badge-pill" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                                                                                                Appearing in Round {r.round_number} (Evaluating)
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td style={{ textAlign: 'right' }}>
                                                                                        {!isCleared && !isRejected && (
                                                                                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                                                                                <select
                                                                                                    className="candidate-action-dropdown"
                                                                                                    value=""
                                                                                                    onChange={(e) => {
                                                                                                        if (e.target.value) {
                                                                                                            handleCandidateAction(s.gmail, e.target.value, r.round_number);
                                                                                                        }
                                                                                                    }}
                                                                                                    title="Select status for candidate: Selected (Green) or Rejected (Red)"
                                                                                                    style={{
                                                                                                        background: '#1e293b',
                                                                                                        color: '#93c5fd',
                                                                                                        border: '1px solid rgba(147, 197, 253, 0.4)',
                                                                                                        fontSize: '0.74rem',
                                                                                                        fontWeight: 600,
                                                                                                        padding: '5px 8px',
                                                                                                        borderRadius: '6px',
                                                                                                        cursor: 'pointer'
                                                                                                    }}
                                                                                                >
                                                                                                    <option value="" disabled>Status Dropdown ▾</option>
                                                                                                    <option value="select" style={{ color: '#10b981', fontWeight: 600 }}>
                                                                                                        {isFinalStage ? '✓ Selected (Offer Job 🏆)' : `✓ Selected (Move to Round ${r.round_number + 1})`}
                                                                                                    </option>
                                                                                                    <option value="reject" style={{ color: '#ef4444', fontWeight: 600 }}>
                                                                                                        ✕ Rejected
                                                                                                    </option>
                                                                                                </select>

                                                                                                {/* Green Selected Button */}
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => handleCandidateAction(s.gmail, 'select', r.round_number)}
                                                                                                    title={isFinalStage ? "Mark candidate as final Selected (Offered Job 🏆)" : `Select candidate: moves them to appear in Round ${r.round_number + 1}`}
                                                                                                    style={{
                                                                                                        display: 'inline-flex',
                                                                                                        alignItems: 'center',
                                                                                                        gap: '4px',
                                                                                                        background: 'linear-gradient(135deg, #059669, #10b981)',
                                                                                                        border: '1px solid rgba(16, 185, 129, 0.5)',
                                                                                                        color: '#ffffff',
                                                                                                        fontSize: '0.74rem',
                                                                                                        fontWeight: 700,
                                                                                                        padding: '5px 11px',
                                                                                                        borderRadius: '6px',
                                                                                                        cursor: 'pointer',
                                                                                                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                                                                                                        transition: 'all 0.15s ease'
                                                                                                    }}
                                                                                                >
                                                                                                    {isFinalStage ? '✓ Selected (Offer 🏆)' : `✓ Selected (Move to R${r.round_number + 1})`}
                                                                                                </button>

                                                                                                {/* Red Rejected Button */}
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => handleCandidateAction(s.gmail, 'reject', r.round_number)}
                                                                                                    title={`Mark candidate as Rejected for Round ${r.round_number}`}
                                                                                                    style={{
                                                                                                        display: 'inline-flex',
                                                                                                        alignItems: 'center',
                                                                                                        gap: '4px',
                                                                                                        background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                                                                                                        border: '1px solid rgba(239, 68, 68, 0.5)',
                                                                                                        color: '#ffffff',
                                                                                                        fontSize: '0.74rem',
                                                                                                        fontWeight: 700,
                                                                                                        padding: '5px 10px',
                                                                                                        borderRadius: '6px',
                                                                                                        cursor: 'pointer',
                                                                                                        boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)',
                                                                                                        transition: 'all 0.15s ease'
                                                                                                    }}
                                                                                                >
                                                                                                    ✕ Rejected
                                                                                                </button>
                                                                                            </div>
                                                                                        )}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: SELECTED STUDENTS & EXCEL DOWNLOAD */}
                            {activeTab === 'selected' && (
                                <div className="selected-tab-content">
                                    <div className="selected-celebration-banner">
                                        <div className="celebration-left">
                                            <div className="trophy-icon">🏆</div>
                                            <div>
                                                <h3>
                                                    {selectedStudents.length} Students Selected by {drive.company_name}
                                                </h3>
                                                <p>
                                                    Full-time offers rolled out for <strong>{drive.job_role}</strong> at <strong>{drive.ctc_lpa} LPA</strong>.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-download-selected-excel large-cta"
                                            onClick={downloadSelectedStudentsExcel}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                <polyline points="7 10 12 15 17 10"></polyline>
                                                <line x1="12" y1="15" x2="12" y2="3"></line>
                                            </svg>
                                            Download Complete Selected Students Excel (.xlsx)
                                        </button>
                                    </div>

                                    {/* Search Filter for Selected */}
                                    <div className="view-toolbar" style={{ marginTop: '16px' }}>
                                        <div className="search-field" style={{ maxWidth: '320px' }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8"></circle>
                                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                            </svg>
                                            <input
                                                type="text"
                                                placeholder="Search selected students..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                        </div>
                                        <span className="results-count-text">
                                            Showing {filteredSelected.length} of {selectedStudents.length} selected candidates
                                        </span>
                                    </div>

                                    <div className="data-panel" style={{ maxHeight: '420px', overflowY: 'auto', marginTop: '12px' }}>
                                        {filteredSelected.length === 0 ? (
                                            <div className="panel-empty" style={{ padding: '40px' }}>
                                                <h3>No Selected Candidates Found</h3>
                                                <p>No candidates have been marked as Selected yet. You can upload results or advance candidates from Round templates.</p>
                                            </div>
                                        ) : (
                                            <table className="enterprise-table">
                                                <thead>
                                                    <tr>
                                                        <th>Reg. Number</th>
                                                        <th>Student Name</th>
                                                        <th>Email / Gmail</th>
                                                        <th>Department</th>
                                                        <th>CGPA</th>
                                                        <th>Round Cleared</th>
                                                        <th>Status</th>
                                                        <th>Offered Package</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredSelected.map(s => (
                                                        <tr key={s.id || s.gmail}>
                                                            <td className="font-mono">{s.register_number || 'N/A'}</td>
                                                            <td className="font-semibold text-emerald-light">{s.student_name}</td>
                                                            <td>{s.gmail}</td>
                                                            <td>{s.department || 'CSE'}</td>
                                                            <td>{s.cgpa ? s.cgpa.toFixed(1) : 'N/A'}</td>
                                                            <td>
                                                                <span className="round-badge" style={{
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '600',
                                                                    background: 'rgba(99, 102, 241, 0.15)',
                                                                    color: '#818cf8',
                                                                    border: '1px solid rgba(99, 102, 241, 0.3)'
                                                                }}>
                                                                    Round {s.round || 1}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className="res-badge-pill pill-selected">
                                                                    {s.result || 'Selected'}
                                                                </span>
                                                            </td>
                                                            <td className="ctc-text font-bold">
                                                                {drive.ctc_lpa} LPA
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: ALL CANDIDATES & GENERAL EXPORT */}
                            {activeTab === 'all' && (
                                <div className="all-candidates-tab-content">
                                    <div className="view-toolbar">
                                        <div className="search-field" style={{ maxWidth: '320px' }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="11" cy="11" r="8"></circle>
                                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                            </svg>
                                            <input
                                                type="text"
                                                placeholder="Search by name, email, department..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="results-count-text">
                                                Showing {filteredCandidates.length} of {allResults.length} candidates
                                            </span>
                                            <button
                                                type="button"
                                                className="btn-export-all-results"
                                                onClick={downloadAllResultsExcel}
                                                title="Export entire evaluation roster to Excel"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                    <polyline points="7 10 12 15 17 10"></polyline>
                                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                                </svg>
                                                Export All Results (.xlsx)
                                            </button>
                                        </div>
                                    </div>

                                    <div className="data-panel" style={{ maxHeight: '420px', overflowY: 'auto', marginTop: '12px' }}>
                                        {filteredCandidates.length === 0 ? (
                                            <div className="panel-empty" style={{ padding: '40px' }}>
                                                <h3>No Candidates Found</h3>
                                                <p>Upload an Excel spreadsheet with candidate results to populate this drive.</p>
                                            </div>
                                        ) : (
                                            <table className="enterprise-table">
                                                <thead>
                                                    <tr>
                                                        <th>Candidate Name</th>
                                                        <th>Gmail</th>
                                                        <th>Department</th>
                                                        <th>Current Round</th>
                                                        <th>Score</th>
                                                        <th>Status / Verdict</th>
                                                        <th style={{ textAlign: 'right' }}>Last Updated</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredCandidates.map(r => (
                                                        <tr key={r.id || r.gmail}>
                                                            <td className="font-semibold">{r.student_name}</td>
                                                            <td>{r.gmail}</td>
                                                            <td>{r.department || 'CSE'}</td>
                                                            <td>
                                                                <span className="round-badge" style={{
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.78rem',
                                                                    fontWeight: '600',
                                                                    background: 'rgba(99, 102, 241, 0.15)',
                                                                    color: '#818cf8',
                                                                    border: '1px solid rgba(99, 102, 241, 0.3)'
                                                                }}>
                                                                    Round {r.round || 1}
                                                                </span>
                                                            </td>
                                                            <td>{r.score !== null && r.score !== undefined ? r.score : '—'}</td>
                                                            <td>
                                                                {(() => {
                                                                    const res = (r.result || '').toLowerCase();
                                                                    const isNeg = res.includes('not select') || res.includes('reject') || res.includes('fail');
                                                                    const isPos = !isNeg && (res.includes('select') || res.includes('placed') || res.includes('offer') || res.includes('pass') || res.includes('clear') || res.includes('qualif'));
                                                                    const badgeClass = isPos ? 'pill-selected' : isNeg ? 'pill-rejected' : '';
                                                                    return (
                                                                        <span className={`res-badge-pill ${badgeClass}`}>
                                                                            {r.result || 'Evaluating'}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                                {r.updated_at}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Section */}
                <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
                    <div className="footer-left-actions">
                        {onOpenUpload && (
                            <button
                                type="button"
                                className="action-btn-secondary"
                                onClick={onOpenUpload}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                Upload Results Spreadsheet (Excel / CSV)
                            </button>
                        )}
                    </div>
                    <button type="button" className="btn-cancel" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
