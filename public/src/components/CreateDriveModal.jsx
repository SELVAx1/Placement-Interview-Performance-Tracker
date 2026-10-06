function CreateDriveModal({ isOpen, onClose, onDriveCreated, driveToEdit = null }) {
    if (!isOpen) return null;

    const isEditMode = Boolean(driveToEdit && driveToEdit.id);

    const standardDefaultRounds = [
        {
            round_number: 1,
            round_name: "Online Assessment (Aptitude & Coding)",
            round_type: "CODING",
            description: "Online test covering core aptitude, computer science fundamentals, and 2-3 algorithmic coding challenges."
        },
        {
            round_number: 2,
            round_name: "Technical Interview I (DSA & Problem Solving)",
            round_type: "TECHNICAL",
            description: "Live whiteboarding and coding interview focusing on Data Structures, Algorithms, and space/time complexity."
        },
        {
            round_number: 3,
            round_name: "Technical Interview II (System Design & Projects)",
            round_type: "TECHNICAL",
            description: "Discussion on past projects, databases, architecture, API design, and core engineering principles."
        },
        {
            round_number: 4,
            round_name: "HR & Cultural Fitment Discussion",
            round_type: "HR",
            description: "Behavioral interview, leadership principles, team communication, and salary/joining timeline alignment."
        },
        {
            round_number: 5,
            round_name: "Director / Executive Leadership Round",
            round_type: "MANAGERIAL",
            description: "Final interview with practice directors / executive leadership on strategic problem solving and fitment."
        },
        {
            round_number: 6,
            round_name: "Founder & Partner Alignment",
            round_type: "HR",
            description: "Final conversation regarding company vision, compensation breakdown, and offer rollout."
        }
    ];

    const [companyName, setCompanyName] = React.useState('');
    const [jobRole, setJobRole] = React.useState('');
    const [ctcLpa, setCtcLpa] = React.useState('');
    const [minCgpa, setMinCgpa] = React.useState('7.0');
    const [location, setLocation] = React.useState('Bangalore / Hybrid');
    const [deadline, setDeadline] = React.useState('2026-10-30');
    const [status, setStatus] = React.useState('Active');
    const [description, setDescription] = React.useState('');
    const [selectedBranches, setSelectedBranches] = React.useState(['CSE', 'IT', 'ECE', 'AIDS']);
    
    // Dynamic rounds pipeline state
    const [rounds, setRounds] = React.useState([]);
    const [loadingRounds, setLoadingRounds] = React.useState(false);
    
    const [loading, setLoading] = React.useState(false);
    const [errorMsg, setErrorMsg] = React.useState('');

    const availableBranches = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL', 'AIDS'];
    const roundTypes = [
        { value: 'CODING', label: '💻 Coding / DSA Assessment' },
        { value: 'TECHNICAL', label: '⚙️ Technical Interview' },
        { value: 'MANAGERIAL', label: '👔 Managerial & System Design' },
        { value: 'HR', label: '🤝 HR & Behavioral' },
        { value: 'APTITUDE', label: '📝 Aptitude & Core MCQs' },
        { value: 'GROUP_DISCUSSION', label: '🗣️ Group Discussion / Case Study' }
    ];

    // Initialize or populate form on open or when driveToEdit changes
    React.useEffect(() => {
        if (isEditMode && driveToEdit) {
            setCompanyName(driveToEdit.company_name || '');
            setJobRole(driveToEdit.job_role || '');
            setCtcLpa(driveToEdit.ctc_lpa != null ? String(driveToEdit.ctc_lpa) : '');
            setMinCgpa(driveToEdit.min_cgpa != null ? String(driveToEdit.min_cgpa) : '0.0');
            setLocation(driveToEdit.location || 'On Campus');
            setDeadline(driveToEdit.deadline || '');
            setStatus(driveToEdit.status || 'Active');
            setDescription(driveToEdit.description || '');

            if (driveToEdit.allowed_branches) {
                const branches = driveToEdit.allowed_branches.split(',').map(b => b.trim()).filter(Boolean);
                setSelectedBranches(branches.length > 0 ? branches : ['All']);
            } else {
                setSelectedBranches(['CSE', 'IT', 'ECE', 'AIDS']);
            }

            // Fetch existing rounds for this drive if not directly provided
            if (driveToEdit.rounds && Array.isArray(driveToEdit.rounds) && driveToEdit.rounds.length > 0) {
                setRounds(driveToEdit.rounds.map((r, i) => ({
                    round_number: r.round_number || (i + 1),
                    round_name: r.round_name || `Round ${i + 1}`,
                    round_type: r.round_type || 'TECHNICAL',
                    description: r.description || ''
                })));
            } else {
                setLoadingRounds(true);
                fetch(`/api/drives/${driveToEdit.id}/process`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.success && data.rounds && data.rounds.length > 0) {
                            setRounds(data.rounds.map((r, i) => ({
                                round_number: r.round_number || (i + 1),
                                round_name: r.round_name || `Round ${i + 1}`,
                                round_type: r.round_type || 'TECHNICAL',
                                description: r.description || ''
                            })));
                        } else {
                            const count = parseInt(driveToEdit.total_rounds || 4, 10);
                            setRounds(generateDefaultRounds(count));
                        }
                    })
                    .catch(() => {
                        const count = parseInt(driveToEdit.total_rounds || 4, 10);
                        setRounds(generateDefaultRounds(count));
                    })
                    .finally(() => setLoadingRounds(false));
            }
        } else {
            // New Drive Initialization defaults
            setCompanyName('');
            setJobRole('');
            setCtcLpa('');
            setMinCgpa('7.0');
            setLocation('Bangalore / Hybrid');
            setDeadline('2026-10-30');
            setStatus('Active');
            setDescription('');
            setSelectedBranches(['CSE', 'IT', 'ECE', 'AIDS']);
            setRounds(standardDefaultRounds.slice(0, 4));
        }
        setErrorMsg('');
    }, [isOpen, driveToEdit]);

    const generateDefaultRounds = (count) => {
        const newRounds = [];
        for (let i = 1; i <= count; i++) {
            if (i <= standardDefaultRounds.length) {
                newRounds.push({ ...standardDefaultRounds[i - 1], round_number: i });
            } else {
                newRounds.push({
                    round_number: i,
                    round_name: `Round ${i} Evaluation`,
                    round_type: 'TECHNICAL',
                    description: `Round ${i} assessment & interview evaluation.`
                });
            }
        }
        return newRounds;
    };

    const handleSetTotalRoundsCount = (targetCount) => {
        const count = Math.max(1, Math.min(8, targetCount));
        if (count === rounds.length) return;

        if (count > rounds.length) {
            const added = [];
            for (let i = rounds.length + 1; i <= count; i++) {
                if (i <= standardDefaultRounds.length) {
                    added.push({ ...standardDefaultRounds[i - 1], round_number: i });
                } else {
                    added.push({
                        round_number: i,
                        round_name: `Round ${i} Evaluation`,
                        round_type: 'TECHNICAL',
                        description: `Round ${i} assessment & interview evaluation.`
                    });
                }
            }
            setRounds([...rounds, ...added]);
        } else {
            setRounds(rounds.slice(0, count));
        }
    };

    const handleAddRound = () => {
        if (rounds.length >= 8) return;
        const nextNum = rounds.length + 1;
        let template = standardDefaultRounds[nextNum - 1] || {
            round_name: `Round ${nextNum} Evaluation`,
            round_type: 'TECHNICAL',
            description: `Round ${nextNum} technical assessment stage.`
        };
        setRounds([...rounds, {
            round_number: nextNum,
            round_name: template.round_name,
            round_type: template.round_type,
            description: template.description
        }]);
    };

    const handleRemoveRound = (idxToRemove) => {
        if (rounds.length <= 1) return;
        const filtered = rounds.filter((_, idx) => idx !== idxToRemove);
        // Re-index remaining rounds
        const reindexed = filtered.map((r, i) => ({
            ...r,
            round_number: i + 1
        }));
        setRounds(reindexed);
    };

    const handleRoundChange = (idx, field, value) => {
        setRounds(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [field]: value };
            return updated;
        });
    };

    const toggleBranch = (branch) => {
        if (selectedBranches.includes(branch)) {
            setSelectedBranches(selectedBranches.filter(b => b !== branch));
        } else {
            setSelectedBranches([...selectedBranches, branch]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!companyName.trim()) {
            setErrorMsg('Please enter the Company Name.');
            return;
        }
        if (!jobRole.trim()) {
            setErrorMsg('Please enter the Job Designation.');
            return;
        }
        if (!ctcLpa || isNaN(ctcLpa) || parseFloat(ctcLpa) <= 0) {
            setErrorMsg('Please enter a valid CTC package (LPA).');
            return;
        }
        if (!rounds || rounds.length === 0) {
            setErrorMsg('Please configure at least 1 selection round for this drive.');
            return;
        }

        // Validate that all rounds have a name
        for (let i = 0; i < rounds.length; i++) {
            if (!rounds[i].round_name || !rounds[i].round_name.trim()) {
                setErrorMsg(`Please specify a valid name for Round ${i + 1}.`);
                return;
            }
        }

        setLoading(true);

        try {
            const payload = {
                company_name: companyName.trim(),
                job_role: jobRole.trim(),
                ctc_lpa: parseFloat(ctcLpa),
                min_cgpa: parseFloat(minCgpa || 0),
                allowed_branches: selectedBranches.length > 0 ? selectedBranches.join(', ') : 'All Branches',
                location: location.trim() || 'On Campus',
                status: status || 'Active',
                deadline: deadline || null,
                description: description.trim() || null,
                total_rounds: rounds.length,
                rounds: rounds.map((r, i) => ({
                    round_number: i + 1,
                    round_name: r.round_name.trim(),
                    round_type: (r.round_type || 'TECHNICAL').toUpperCase(),
                    description: (r.description || '').trim()
                }))
            };

            const endpoint = isEditMode ? `/api/drives/${driveToEdit.id}` : '/api/drives';
            const method = isEditMode ? 'PUT' : 'POST';

            const response = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (onDriveCreated) {
                    onDriveCreated(data.drive, isEditMode);
                }
                onClose();
            } else {
                setErrorMsg(data.message || `Failed to ${isEditMode ? 'alter' : 'create'} placement drive.`);
            }
        } catch (err) {
            console.error('Error saving drive:', err);
            setErrorMsg('Server error. Could not connect to API.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-dialog drive-config-modal" onClick={(e) => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="modal-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div className="brand-icon" style={{ width: '42px', height: '42px', flexShrink: 0 }}>
                            <img src="/static/icon.png" alt="Placement System" />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.18rem', margin: 0, fontWeight: 700 }}>
                                {isEditMode ? `Alter Drive: ${companyName || 'Company'}` : 'Initialize Placement Drive'}
                            </h3>
                            <p className="modal-sub" style={{ margin: '3px 0 0', color: '#94a3b8' }}>
                                {isEditMode
                                    ? 'Modify hiring criteria, adjust total rounds, and customize round descriptions'
                                    : 'Configure recruitment specifications and setup dynamic multi-round evaluation pipeline'}
                            </p>
                        </div>
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} title="Close">&times;</button>
                </div>

                {errorMsg && (
                    <div className="form-alert-error" style={{ marginBottom: '12px' }}>
                        {errorMsg}
                    </div>
                )}

                {/* Scrollable Form Body */}
                <form onSubmit={handleSubmit} className="modal-form" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div className="drive-modal-scrollable">
                        {/* Section 1: Company & Position Details */}
                        <div className="section-divider-title" style={{ marginTop: 0 }}>
                            1. Company & Role Specifications
                        </div>

                        <div className="form-row-2">
                            <div className="input-field">
                                <label>Company Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Google, Microsoft, Zoho, Atlassian"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="input-field">
                                <label>Job Designation *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Full Stack Engineer, SDE-1, Cloud Associate"
                                    value={jobRole}
                                    onChange={(e) => setJobRole(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="input-field">
                                <label>CTC Package (LPA) *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="e.g. 18.5"
                                    value={ctcLpa}
                                    onChange={(e) => setCtcLpa(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="input-field">
                                <label>Minimum CGPA</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    max="10.0"
                                    placeholder="e.g. 7.5"
                                    value={minCgpa}
                                    onChange={(e) => setMinCgpa(e.target.value)}
                                />
                            </div>

                            <div className="input-field">
                                <label>Work Location</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Bangalore / Remote / Hybrid"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                />
                            </div>

                            <div className="input-field">
                                <label>Registration Deadline</label>
                                <input
                                    type="date"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                />
                            </div>

                            {isEditMode && (
                                <div className="input-field">
                                    <label>Drive Status</label>
                                    <select
                                        className="round-select-clean"
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                    >
                                        <option value="Active">Active / In Progress</option>
                                        <option value="Completed">Completed / Closed</option>
                                        <option value="Upcoming">Upcoming</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Eligible Branches */}
                        <div className="input-field full" style={{ marginTop: '10px' }}>
                            <label style={{ marginBottom: '6px', display: 'block' }}>Eligible Academic Branches</label>
                            <div className="branch-selector">
                                {availableBranches.map(branch => {
                                    const isSelected = selectedBranches.includes(branch);
                                    return (
                                        <button
                                            type="button"
                                            key={branch}
                                            className={`branch-chip ${isSelected ? 'active' : ''}`}
                                            onClick={() => toggleBranch(branch)}
                                        >
                                            {branch}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Drive Description / Notes */}
                        <div className="input-field full" style={{ marginTop: '12px' }}>
                            <label>Company & Drive Overview (Description)</label>
                            <textarea
                                className="round-textarea-clean"
                                style={{ minHeight: '65px' }}
                                placeholder="e.g. Tier-1 campus drive for high-performance backend systems. Emphasizes clean coding, solid understanding of concurrency, and database optimizations."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>

                        {/* Section 2: Dynamic Interview Rounds Pipeline */}
                        <div className="section-divider-title">
                            2. Selection Pipeline & Interview Rounds ({rounds.length} Total Stages)
                        </div>

                        <div className="round-pipeline-box">
                            {/* Toolbar to select quick round counts */}
                            <div className="round-count-toolbar">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600 }}>
                                        Total Rounds for this Company:
                                    </span>
                                    <span className="round-count-badge">
                                        {rounds.length} Rounds
                                    </span>
                                </div>

                                <div className="round-count-pills">
                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Quick Set:</span>
                                    {[1, 2, 3, 4, 5, 6].map(cnt => (
                                        <button
                                            type="button"
                                            key={cnt}
                                            className={`round-pill-btn ${rounds.length === cnt ? 'active' : ''}`}
                                            onClick={() => handleSetTotalRoundsCount(cnt)}
                                        >
                                            {cnt} {cnt === 1 ? 'Round' : 'Rounds'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Round Cards */}
                            {loadingRounds ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.84rem' }}>
                                    Loading existing round pipeline...
                                </div>
                            ) : (
                                <div className="round-cards-container">
                                    {rounds.map((round, idx) => (
                                        <div key={idx} className="round-card-item">
                                            <div className="round-card-item-header">
                                                <div className="round-card-num-badge">
                                                    <span>Stage {idx + 1}</span>
                                                    <span style={{ opacity: 0.6 }}>•</span>
                                                    <span>Round {idx + 1} of {rounds.length}</span>
                                                </div>

                                                {rounds.length > 1 && (
                                                    <button
                                                        type="button"
                                                        className="btn-remove-round"
                                                        onClick={() => handleRemoveRound(idx)}
                                                        title={`Remove Round ${idx + 1}`}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6"></polyline>
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                        </svg>
                                                        <span>Remove</span>
                                                    </button>
                                                )}
                                            </div>

                                            <div className="round-card-grid">
                                                <div>
                                                    <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '3px' }}>
                                                        Round Name / Title *
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className="round-input-clean"
                                                        placeholder={`e.g. Round ${idx + 1}: Technical Interview`}
                                                        value={round.round_name}
                                                        onChange={(e) => handleRoundChange(idx, 'round_name', e.target.value)}
                                                        required
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '3px' }}>
                                                        Round Type
                                                    </label>
                                                    <select
                                                        className="round-select-clean"
                                                        value={round.round_type || 'TECHNICAL'}
                                                        onChange={(e) => handleRoundChange(idx, 'round_type', e.target.value)}
                                                    >
                                                        {roundTypes.map(t => (
                                                            <option key={t.value} value={t.value}>{t.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '3px' }}>
                                                    Round Assessment Description & Criteria
                                                </label>
                                                <textarea
                                                    className="round-textarea-clean"
                                                    placeholder="Detailed description of round format, duration, syllabus, or assessment criteria..."
                                                    value={round.description || ''}
                                                    onChange={(e) => handleRoundChange(idx, 'description', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add Round Button */}
                            {rounds.length < 8 && (
                                <button
                                    type="button"
                                    className="btn-add-round-btn"
                                    onClick={handleAddRound}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                    <span>Add Another Round (Stage {rounds.length + 1})</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="modal-foot" style={{ marginTop: '12px' }}>
                        <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-submit" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            {loading ? (
                                <span>{isEditMode ? 'Saving Changes...' : 'Initializing Drive...'}</span>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                        <polyline points="7 3 7 8 15 8"></polyline>
                                    </svg>
                                    <span>{isEditMode ? 'Save & Alter Drive' : `Initialize Drive (${rounds.length} Rounds)`}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
