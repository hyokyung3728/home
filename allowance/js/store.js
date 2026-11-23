import { firebaseConfig, PARENTS } from '../firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import * as FS from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = FS.persistentLocalCache
  ? FS.initializeFirestore(app, {
      localCache: FS.persistentLocalCache({ tabManager: FS.persistentMultipleTabManager() }),
    })
  : getFirestore(app);

const SAVE_TIMEOUT_MS = 8000;
let currentUser = null;
let currentRole = null;

function roleOf(user) {
  return user ? PARENTS[(user.email || '').toLowerCase()] ?? null : null;
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    currentRole = roleOf(user);
    cb(user ? { email: user.email } : null, currentRole);
  });
}

export async function signInWithGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser() {
  await signOut(auth);
}

function requireParent() {
  if (!currentUser || !currentRole) throw new Error('NOT_PARENT');
}

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('SAVE_TIMEOUT')), SAVE_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function subscribeChildren(cb) {
  return onSnapshot(collection(db, 'children'), (snap) => {
    const children = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.order - b.order);
    cb(children);
  });
}

export function subscribeTransactions(childId, cb) {
  const q = query(collection(db, 'transactions'), where('childId', '==', childId));
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const txs = snap.docs
      .map((d) => {
        const data = d.data({ serverTimestamps: 'estimate' });
        return {
          id: d.id,
          amount: data.amount,
          reason: data.reason,
          by: data.by,
          createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
          cancelled: data.cancelled === true,
          pending: d.metadata.hasPendingWrites,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    cb(txs);
  });
}

export async function addTransaction({ childId, signedAmount, reason }) {
  requireParent();
  await withTimeout(
    addDoc(collection(db, 'transactions'), {
      childId,
      amount: signedAmount,
      reason,
      by: currentRole,
      byEmail: currentUser.email,
      createdAt: serverTimestamp(),
      cancelled: false,
    }),
  );
}

export async function cancelTransaction(txId) {
  requireParent();
  await withTimeout(
    updateDoc(doc(db, 'transactions', txId), {
      cancelled: true,
      cancelledAt: serverTimestamp(),
    }),
  );
}

export function subscribeReasons(cb) {
  return onSnapshot(collection(db, 'reasons'), (snap) => {
    const reasons = snap.docs
      .map((d) => ({ id: d.id, text: d.data().text }))
      .sort((a, b) => a.text.localeCompare(b.text, 'ko'));
    cb(reasons);
  });
}

export async function addReason(text) {
  requireParent();
  await withTimeout(addDoc(collection(db, 'reasons'), { text, createdAt: serverTimestamp() }));
}

export async function removeReason(id) {
  requireParent();
  await withTimeout(deleteDoc(doc(db, 'reasons', id)));
}

export async function getPin() {
  requireParent();
  const snap = await getDoc(doc(db, 'settings', 'pin'));
  return snap.exists() ? snap.data() : null;
}

export async function setPin({ salt, hash }) {
  requireParent();
  await withTimeout(setDoc(doc(db, 'settings', 'pin'), { salt, hash }));
}

export async function createChildren(names) {
  requireParent();
  await withTimeout(
    Promise.all(
      names.map((name, order) =>
        setDoc(doc(db, 'children', order === 0 ? 'first' : 'second'), { name, order }),
      ),
    ),
  );
}
