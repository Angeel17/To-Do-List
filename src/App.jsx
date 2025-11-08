import React, { useEffect, useState, useMemo } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./App.css";

// --- NEW MODAL COMPONENT ---

const AddTaskModal = ({
  isVisible,
  onClose,
  onSubmit,
  initialList,
  allLists,
  CORE_VIEWS,
}) => {
  const [task, setTask] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [listName, setListName] = useState(initialList);
  const [selectedCoreView, setSelectedCoreView] = useState("Today");

  useEffect(() => {
    // Reset internal state when modal opens or initialList changes
    if (isVisible) {
      setTask("");
      setDescription("");
      setDueDate("");
      setListName(initialList);
      setSelectedCoreView("Today");
    }
  }, [isVisible, initialList]);

  // Ensure the listName is set to the first available list if the initial one is invalid
  useEffect(() => {
    if (isVisible && allLists.length > 0) {
      if (!allLists.some(l => l.name === listName)) {
        setListName(allLists[0].name);
      }
    }
  }, [isVisible, allLists, listName]);


  const handleSubmit = (e) => {
    e.preventDefault();
    if (!task.trim() || allLists.length === 0) return; // Prevent adding if no list exists

    // Find the actual list name to use for saving
    const finalListName = allLists.find(l => l.name === listName)?.name || allLists[0]?.name;

    onSubmit({
      task,
      description,
      dueDate,
      listName: finalListName,
      coreViewTag: selectedCoreView,
    });
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content-animated" onClick={(e) => e.stopPropagation()}>
        <h3>➕ Add New Task</h3>
        <form onSubmit={handleSubmit}>
          
          {/* 1. Task Name */}
          <input
            type="text"
            placeholder="Task Name"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            required
            autoFocus
          />

          {/* 2. Description */}
          <textarea
            placeholder="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows="3"
          />

          <div className="modal-detail-group">
            {/* 3. Due Date */}
            <div className="modal-detail-row">
              <label>Due Date:</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          
            {/* 4. List Selector (Mandatory for storage) */}
            <div className="modal-detail-row">
              <label>Assign to List:</label>
              <select
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                required
              >
                {allLists.length === 0 ? (
                    <option disabled>No Custom Lists Available</option>
                ) : (
                    allLists.map((list) => (
                        <option key={list.id} value={list.name}>{list.name}</option>
                    ))
                )}
              </select>
            </div>
          </div>

          {/* 5. Core View Selector (for context/priority tagging) */}
          <label className="core-view-label">Task Context/Priority:</label>
          <div className="core-view-selector">
            {CORE_VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                className={`core-view-btn ${selectedCoreView === view ? 'active' : ''}`}
                onClick={() => setSelectedCoreView(view)}
              >
                {view}
              </button>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
            <button type="submit" className="add-btn" disabled={allLists.length === 0 || !task.trim()}>Add Task</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- APP COMPONENT ---

export default function App() {
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Task State
  const [todos, setTodos] = useState([]); // This will now hold ALL todos for filtering
  // const [newTask, setNewTask] = useState(""); // Kept for potential quick add bar functionality
  const [editId, setEditId] = useState(null); // For inline task editing
  const [editTask, setEditTask] = useState("");

  // List Management State
  const [lists, setLists] = useState([]);
  const [newList, setNewList] = useState("");
  const [editListId, setEditListId] = useState(null);
  const [editListName, setEditListName] = useState("");

  // Filtering/View State
  const CORE_VIEWS = ['Today', 'Upcoming', 'Calendar', 'Sticky Wall'];
  const [selectedView, setSelectedView] = useState("Today");
  const [selectedList, setSelectedList] = useState("Today"); 

  // Detail Panel State
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [detailTaskName, setDetailTaskName] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [detailDueDate, setDetailDueDate] = useState("");
  const [detailList, setDetailList] = useState("");
  
  // New Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);


  // --- Helper Functions ---
  
  // Helper to find the List ID from the selected list name
  const getListIdByName = (listName) => {
    return lists.find(l => l.name === listName)?.id;
  };
  
  // Helper to find a list name by ID
  const getListNameById = (listId) => {
    return lists.find(l => l.id === listId)?.name;
  };


  // --- Hooks for Authentication and Data Fetching ---
  
  // Hook 1: Manages Auth State (Runs ONLY ONCE)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        // Clear all data when user signs out
        setTodos([]);
        setLists([]);
        setSelectedList("Today"); // Reset view to default
        setSelectedView("Today");
      }
    });
    return () => unsubscribe();
  }, []);


  // Hook 2: Manages Lists and ALL Task Data Fetching (Runs when user logs in/out)
  useEffect(() => {
    if (user) {
      // 1. Always fetch user's custom lists
      fetchLists(user.uid);
      
      // 2. To support Core Views, we must fetch ALL tasks into the main `todos` state
      // This is a trade-off for simplicity. For massive apps, a single 'todos' collection 
      // with a 'listId' field would be more scalable/performant for a 'fetch all' query.
      fetchAllTodos(user.uid); 
      
      setSelectedTaskId(null); // Close details panel on user change
    }
  }, [user]); 

  // --- Derived State for Filtering ---

  // Filter tasks based on the selectedList/selectedView
  const filteredTodos = useMemo(() => {
    if (!user) return [];

    // Filter by Custom List (if a custom list is selected)
    if (!CORE_VIEWS.includes(selectedList)) {
        return todos.filter(t => t.list === selectedList);
    } 

    // Filter by Core View (if a core view is selected)
    switch (selectedList) {
        case 'Today':
            // Logic to determine 'Today' tasks (e.g., due date is today)
            const today = new Date().toISOString().split('T')[0];
            return todos.filter(t => t.dueDate === today);
        case 'Upcoming':
            // Logic to determine 'Upcoming' tasks (e.g., due date is in the future)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            return todos.filter(t => t.dueDate >= tomorrowStr);
        case 'Calendar':
        case 'Sticky Wall':
            // For views without direct filters, show everything for now
            return todos;
        default:
            return todos;
    }
  }, [todos, selectedList, user, CORE_VIEWS]);


  // Split filtered tasks into active and completed for the UI
  const [activeTodos, completedTodos] = useMemo(() => {
    const active = filteredTodos.filter(t => t.status !== 'Done');
    const completed = filteredTodos.filter(t => t.status === 'Done');
    return [active, completed];
  }, [filteredTodos]);


  // --- Auth Handlers ---
  const handleAuth = async (type) => {
    try {
      if (type === "sign-up") {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account created! You can now sign in.");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // --- Filtering Handlers ---
  const handleTaskViewChange = (view) => {
    // Both states are updated to manage the selection visually and for the filter logic
    setSelectedView(view);
    setSelectedList(view);
    setSelectedTaskId(null);
  };

  const handleListChange = (listName) => {
    setSelectedList(listName);
    setSelectedView('Today'); // Always reset the core view selection when switching to a list
    setSelectedTaskId(null);
  };

  // --- Firestore Lists CRUD ---
  
  const fetchLists = async (uid) => {
    try {
        const q = query(collection(db, "lists"), where("uid", "==", uid));
        const snapshot = await getDocs(q);
        const listsData = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (a.name > b.name ? 1 : -1));
        
        setLists(listsData);

        // Ensure selected list is still valid after fetch/update
        if (listsData.length > 0 && CORE_VIEWS.includes(selectedList)) {
            // Keep Core View if one is selected and lists were empty before
        } else if (listsData.length > 0 && !listsData.some(l => l.name === selectedList)) {
            // If the selected list was deleted/renamed, switch to the first list
            setSelectedList(listsData[0].name);
        } else if (listsData.length === 0 && !CORE_VIEWS.includes(selectedList)) {
            // If all lists were deleted, switch to the default Core View
            setSelectedList("Today");
        }

    } catch (err) {
        console.error("Error fetching lists:", err);
    }
  };

  const addList = async () => {
    const trimmedList = newList.trim();
    if (!trimmedList || lists.some(l => l.name === trimmedList)) return;

    await addDoc(collection(db, "lists"), {
      uid: user.uid,
      name: trimmedList,
      createdAt: new Date(),
    });
    setNewList("");
    fetchLists(user.uid);
  };

  const startEditList = (list) => {
    setEditListId(list.id);
    setEditListName(list.name);
  };

  const saveEditList = async () => {
    const trimmedEditName = editListName.trim();
    if (!trimmedEditName || lists.some(l => l.name === trimmedEditName && l.id !== editListId)) return; // Prevent duplicate names

    const listRef = doc(db, "lists", editListId);
    await updateDoc(listRef, { name: trimmedEditName });

    // Update selectedList if the current list was renamed
    if (selectedList === lists.find(l => l.id === editListId)?.name) {
        setSelectedList(trimmedEditName);
    }

    setEditListId(null);
    setEditListName("");
    fetchLists(user.uid);

    // After renaming a list, you need to update all corresponding todos.
    // This is a complex batch write and is left for a more advanced Firebase solution (e.g., Cloud Function).
    // For now, only the list name is updated in the list document.
    // The current task-fetching logic will work because tasks are re-fetched by name. 
  };

  const deleteList = async (listId, listName) => {
      if (!window.confirm(`Are you sure you want to delete the list "${listName}"? All tasks within it will be deleted too.`)) return;

      // Deletes the list document. (Tasks are deleted manually or via Cloud Functions/rules)
      await deleteDoc(doc(db, "lists", listId));

      // In a real application, you must use a **Cloud Function** to delete the subcollection documents. 
      // Manual/Client-side delete is usually not safe or practical for large subcollections.
      
      // For this example, we simply refresh the lists and tasks state
      if (selectedList === listName) {
          const remainingLists = lists.filter(l => l.id !== listId);
          setSelectedList(remainingLists.length > 0 ? remainingLists[0].name : 'Today');
      }

      fetchLists(user.uid);
      fetchAllTodos(user.uid); // Refresh all todos to remove the ones from the deleted list
  };

  // --- Firestore Todos CRUD ---
  
  // New function to fetch ALL todos from ALL lists
  const fetchAllTodos = async (uid) => {
    try {
        const listsSnapshot = await getDocs(query(collection(db, "lists"), where("uid", "==", uid)));
        let allTodos = [];

        for (const listDoc of listsSnapshot.docs) {
            const listId = listDoc.id;
            const listName = listDoc.data().name;
            const todosQ = query(collection(db, "lists", listId, "todos"));
            const todosSnapshot = await getDocs(todosQ);

            todosSnapshot.docs.forEach((todoDoc) => {
                allTodos.push({ 
                    id: todoDoc.id, 
                    ...todoDoc.data(), 
                    list: listName, // Attach the list name for easy filtering
                    listId: listId // Store list ID for CRUD operations
                });
            });
        }
        
        allTodos.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

        setTodos(allTodos);
    } catch (err) {
        console.error("Error fetching all todos:", err);
    }
  };


  // --- ADD TODO: Handles data from the modal ---
  const addTodo = async (taskData) => {
    // taskData = { task, description, dueDate, listName, coreViewTag }
    const { task: newTaskName, description, dueDate, listName, coreViewTag } = taskData;
    
    const listId = getListIdByName(listName);

    if (!listId) {
        return alert("Error finding target list. Please select a valid list.");
    }

    // Add document to the 'todos' subcollection using the determined listId
    await addDoc(collection(db, "lists", listId, "todos"), {
      task: newTaskName,
      status: "Pending",
      createdAt: new Date(),
      list: listName, 
      description: description,
      dueDate: dueDate,
      coreViewTag: coreViewTag, // Store the tag for filtering later
      // uid: user.uid // Not strictly needed here if rules handle it, but can be useful
    });
    
    // Refresh all todos
    fetchAllTodos(user.uid);
  };

  const changeStatus = async (todo) => {
    // We can use the 'list' property on the todo object which we stored during fetch
    const listId = getListIdByName(todo.list);
    if (!listId) return;
    
    const todoRef = doc(db, "lists", listId, "todos", todo.id); 
    
    let nextStatus = "In Progress";
    if (todo.status === "In Progress") {
        nextStatus = "Done";
    } else if (todo.status === "Done") {
        nextStatus = "Pending";
    }

    await updateDoc(todoRef, { status: nextStatus });
    // Refresh all todos
    fetchAllTodos(user.uid);
  };


  // --- Task Detail Panel Handlers ---
  const selectTaskForDetails = (taskId) => {
    // Close task details if clicking on the currently selected task
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null);
      setDetailTaskName("");
      return;
    }

    const task = todos.find(t => t.id === taskId);
    if (task) {
      setSelectedTaskId(task.id);
      setDetailTaskName(task.task);
      setDetailDescription(task.description || '');
      setDetailDueDate(task.dueDate || '');
      setDetailList(task.list);
      setEditId(null);
    }
  };

  const saveTaskDetails = async () => {
    if (!selectedTaskId || !detailTaskName.trim()) return;

    const currentTask = todos.find(t => t.id === selectedTaskId);
    // Find the List ID from the todo object's stored list property
    const oldListId = getListIdByName(currentTask.list); 
    const newListId = getListIdByName(detailList);
    
    if (!oldListId || !newListId) return;

    const updatedFields = {
      task: detailTaskName.trim(),
      description: detailDescription,
      dueDate: detailDueDate,
      list: detailList,
    };

    // Case 1: List is not changed (Update in place)
    if (oldListId === newListId) {
        const taskRef = doc(db, "lists", oldListId, "todos", selectedTaskId);
        await updateDoc(taskRef, updatedFields);

    // Case 2: List is changed (Move operation: Add to new list, delete from old)
    } else {
        // A. Add to new list
        await addDoc(collection(db, "lists", newListId, "todos"), {
            ...currentTask, // Spread all existing properties (status, createdAt, etc.)
            ...updatedFields, // Override with new details and new list name
            list: detailList, // Ensure list field is updated
        });

        // B. Delete from old list
        await deleteDoc(doc(db, "lists", oldListId, "todos", selectedTaskId));
    }


    setSelectedTaskId(null);
    fetchAllTodos(user.uid); // Refetch to update the UI
  };

  const deleteTask = async () => {
    if (!selectedTaskId || !window.confirm("Are you sure you want to delete this task?")) return;

    const currentTask = todos.find(t => t.id === selectedTaskId);
    const currentListId = getListIdByName(currentTask.list);
    
    if (!currentListId) return;

    await deleteDoc(doc(db, "lists", currentListId, "todos", selectedTaskId));

    setSelectedTaskId(null);
    fetchAllTodos(user.uid);
  };

  // Inline edit functions (for task name in main list)
  const startEdit = (todo) => {
    setEditId(todo.id);
    setEditTask(todo.task);
    setSelectedTaskId(null);
  };

  // --- SAVE EDIT: Handles both name update and list move ---
  const saveEdit = async (todo, newListValue) => {
    const currentListId = getListIdByName(todo.list);
    const targetListName = newListValue || todo.list; 
    const targetListId = getListIdByName(targetListName);

    if (!currentListId || !targetListId) return;
    
    // If inline editing name, use the edited task name. Otherwise, use the original.
    const taskNameUpdate = editId ? editTask.trim() || todo.task : todo.task; 

    // Case 1: Only name change, or list name hasn't changed.
    if (currentListId === targetListId) {
      if (editId) { // Only update if actively editing the task name
          const todoRef = doc(db, "lists", currentListId, "todos", todo.id);
          await updateDoc(todoRef, { task: taskNameUpdate });
      }
    // Case 2: The list has changed (task needs to be moved).
    } else {
        // Step A: Create a new document in the target list's subcollection
        await addDoc(collection(db, "lists", targetListId, "todos"), {
            ...todo, // Copy all existing properties
            task: taskNameUpdate,
            list: targetListName, // IMPORTANT: Update the list field
        });

        // Step B: Delete the original document from the old list's subcollection
        await deleteDoc(doc(db, "lists", currentListId, "todos", todo.id));
    }
    
    // Reset editing state after save or move
    setEditId(null);
    setEditTask("");
    
    // Refetch the tasks for the currently selected view/list
    fetchAllTodos(user.uid);
};


  // --- UI Logic ---
  if (!user)
    return (
      <div className="auth-container">
        <h1>{authView === "sign-up" ? "Sign Up" : "Sign In"}</h1>
        <div className="auth-box">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={() => handleAuth(authView)}>
            {authView === "sign-up" ? "Sign Up" : "Sign In"}
          </button>
          <p
            onClick={() =>
              setAuthView(authView === "sign-up" ? "sign-in" : "sign-up")
            }
          >
            {authView === "sign-up"
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </p>
        </div>
      </div>
    );

  // Todo List UI (Three-Column Layout)
  const isDetailsOpen = selectedTaskId !== null;
  const initialListName = lists.length > 0 ? lists[0].name : "Today"; // Use "Today" as fallback

  return (
    <>
      <AddTaskModal
        isVisible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={addTodo}
        initialList={lists.length > 0 ? lists[0].name : initialListName} 
        allLists={lists}
        CORE_VIEWS={CORE_VIEWS}
      />
    
      <div className={`app-layout ${isDetailsOpen ? 'details-open' : 'details-closed'}`}>
        {/* 1. Left Sidebar / Menu */}
        <div className="sidebar">
          <div className="menu-header">Menu</div>
          <div className="search-box">
            <input type="text" placeholder="Search" />
          </div>

          <div className="menu-section">
            <h4>TASKS</h4>
            <ul className="menu-list">
              {CORE_VIEWS.map((view) => (
                <li
                  key={view}
                  className={`menu-item ${selectedList === view ? 'active' : ''}`}
                  onClick={() => handleTaskViewChange(view)}
                >
                  {view} 
                  {/* Task count is hard to calculate without filtering ALL tasks, use filteredTodos.length */}
                  {view === selectedList && <span className="task-count">{activeTodos.length}</span>} 
                </li>
              ))}
            </ul>
          </div>

          <div className="menu-section">
            <h4>LISTS</h4>
            <ul className="menu-list">
              {lists.map((list) => (
                <li
                  key={list.id}
                  className={`menu-item ${selectedList === list.name ? 'active' : ''}`}
                  onClick={() => handleListChange(list.name)}
                >
                  {editListId === list.id ? (
                    <div className="edit-list-input" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={editListName}
                        onChange={(e) => setEditListName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEditList()}
                      />
                      <button onClick={saveEditList}>✓</button>
                    </div>
                  ) : (
                    <>
                      <span>{list.name}</span>
                      <div className="list-actions">
                         {/* Count for this specific list */}
                         <span className="list-count task-count">{todos.filter(t => t.list === list.name && t.status !== 'Done').length}</span> 
                        <span className="edit-list-btn" onClick={(e) => { e.stopPropagation(); startEditList(list); }}>✎</span>
                        <span className="delete-list-btn" onClick={(e) => { e.stopPropagation(); deleteList(list.id, list.name); }}>✕</span>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {/* Add New List Input */}
              <li className="menu-item add-new-list">
                <input
                  type="text"
                  placeholder="+ Add New List"
                  value={newList}
                  onChange={(e) => setNewList(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addList()}
                  disabled={editListId !== null}
                />
                <button onClick={addList} disabled={editListId !== null}>+</button>
              </li>
            </ul>
          </div>

          <ul className="menu-footer">
            <li className="menu-item">Settings</li>
            <li className="menu-item" onClick={handleSignOut}>Sign out</li>
          </ul>
        </div>

        {/* 2. Center Content / Task List */}
        <div className="main-content">
          <div className="content-header">
            <div className="hamburger">☰</div>
            <h1>{selectedList}</h1>
            <span className="task-total">{filteredTodos.length}</span>
          </div>

          {/* New Add Task Button */}
          <div className="add-task-button-container">
            <button 
              className="add-task-trigger-btn"
              onClick={() => setIsModalOpen(true)}
              disabled={lists.length === 0}
            >
              + Add New Task
            </button>
            {lists.length === 0 && (
              <p className="add-task-warning">Create a custom list to enable adding tasks.</p>
            )}
          </div>
          
          <ul className="task-list">
            {/* Show message only if selected a custom list AND there are no tasks */}
            {filteredTodos.length === 0 && !CORE_VIEWS.includes(selectedList) && lists.some(l => l.name === selectedList) && (
              <p className="empty">No tasks in the list **{selectedList}** yet.</p>
            )}
            
            {/* Show message if a core view is selected but no custom lists exist */}
            {CORE_VIEWS.includes(selectedList) && todos.length === 0 && lists.length === 0 && (
               <p className="empty">Create a custom list and add tasks to see them here.</p>
            )}

            {/* --- Active Tasks --- */}
            {activeTodos.map((todo) => (
              <li
                key={todo.id}
                className={`task-item ${selectedTaskId === todo.id ? 'selected-detail' : ''}`}
                onClick={(e) => { e.stopPropagation(); selectTaskForDetails(todo.id); }}
              >
                {editId === todo.id ? (
                  <div className="edit-section-inline">
                    {/* 1. Task Name Input */}
                    <input
                      value={editTask}
                      onChange={(e) => setEditTask(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(todo, todo.list)}
                    />
                    
                    {/* 2. List Dropdown */}
                    <select 
                      className="inline-list-select" 
                      value={todo.list}
                      onChange={(e) => saveEdit(todo, e.target.value)} 
                    >
                      {lists.map(list => (
                          <option key={list.id} value={list.name}>{list.name}</option> 
                      ))}
                    </select>

                    {/* 3. Save Button */}
                    <button className="save-btn-inline" onClick={() => saveEdit(todo, todo.list)}>
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className={`checkbox ${todo.status.toLowerCase().replace(' ', '-')}`}
                      onClick={(e) => {e.stopPropagation(); changeStatus(todo)}}
                    ></span>
                    <span
                      className="task-text"
                      style={{ textDecoration: todo.status === 'Done' ? 'line-through' : 'none' }}
                    >
                      {todo.task}
                    </span>
                    <div className="task-metadata">
                      <span className="meta-tag list-name">{todo.list}</span>
                      {todo.dueDate && <span className="meta-tag date">📅 {todo.dueDate}</span>}
                      <span
                        className="edit-task-btn"
                        onClick={(e) => { e.stopPropagation(); startEdit(todo); }}
                      >
                        ✎
                      </span>
                      <span
                        className="meta-arrow"
                      >
                        {`>`}
                      </span>
                    </div>
                  </>
                )}
              </li>
            ))}

            {/* --- Completed Tasks --- */}
            {completedTodos.length > 0 && (
              <li className="completed-header">
                Completed ({completedTodos.length})
              </li>
            )}
            {completedTodos.map((todo) => (
              <li
                key={todo.id}
                className={`task-item task-item-done ${selectedTaskId === todo.id ? 'selected-detail' : ''}`}
                onClick={(e) => { e.stopPropagation(); selectTaskForDetails(todo.id); }}
              >
                <>
                  <span
                    className={`checkbox ${todo.status.toLowerCase().replace(' ', '-')}`}
                    onClick={(e) => {e.stopPropagation(); changeStatus(todo)}}
                  ></span>
                  <span
                    className="task-text"
                    style={{ textDecoration: 'line-through' }} 
                  >
                    {todo.task}
                  </span>
                  <div className="task-metadata">
                    <span className="meta-tag list-name">{todo.list}</span>
                    {todo.dueDate && <span className="meta-tag date">📅 {todo.dueDate}</span>}
                    <span
                      className="meta-arrow"
                    >
                      {`>`}
                    </span>
                  </div>
                </>
              </li>
            ))}
          </ul>
        </div>

        {/* 3. Right Panel / Task Details */}
        <div className={`task-details-panel ${isDetailsOpen ? 'open' : ''}`}>
          {selectedTaskId ? (
            <>
              <span className="close-btn" onClick={() => setSelectedTaskId(null)}>✕</span>
              <h4>Task:</h4>
              <input
                type="text"
                className="task-detail-title-input"
                value={detailTaskName}
                onChange={(e) => setDetailTaskName(e.target.value)}
              />

              <h4 className="detail-subheader">Description</h4>
              <textarea
                className="description-input"
                rows="3"
                placeholder="Add a detailed description..."
                value={detailDescription}
                onChange={(e) => setDetailDescription(e.target.value)}
              ></textarea>

              <div className="detail-row">
                <span>List</span>
                <select
                  value={detailList}
                  onChange={(e) => setDetailList(e.target.value)}
                  className="small-input list-select"
                >
                  {lists.map(list => (
                    <option key={list.id} value={list.name}>{list.name}</option>
                  ))}
                </select>
              </div>

              <div className="detail-row">
                <span>Due date</span>
                <input
                  type="date"
                  value={detailDueDate}
                  onChange={(e) => setDetailDueDate(e.target.value)}
                  className="small-input"
                />
              </div>

              <h4 className="detail-subheader">Subtasks:</h4>
              <div className="subtask-add">+ Add New Subtask</div>
              <div className="subtask-item">Subtask</div>

              <div className="detail-actions">
                <button className="delete-task-btn" onClick={deleteTask}>Delete Task</button>
                <button className="save-changes-btn" onClick={saveTaskDetails}>Save changes</button>
              </div>
            </>
          ) : (
            <p className="empty-details">Select a task using the arrow to see details.</p>
          )}
        </div>
      </div>
    </>
  );
}