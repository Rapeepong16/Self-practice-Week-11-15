//สิ่งที่ได้เรียนรู้จาก Integrated Project

// แปลง ISO datetime จาก server → string ตาม timezone local ของ browser
// รูปแบบ: dd/MM/yyyy, HH:mm:ss (en-GB)
function formatLocalDateWithZone(isoString) {
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    return formatter.format(dt);
  } catch (e) {
    console.error("formatLocalDateWithZone error", e);
    return isoString;
  }
}

// ดึง studentId จาก token ของ Keycloak
// พยายามใช้ field ที่เป็นรหัสนักศึกษาก่อน (studentId, student-id)
// ถ้าไม่มี fallback เป็น preferred_username หรือ sub (UUID)
function getStudentId() {
  const p = keycloak.tokenParsed || {};
  return (
    p.studentId ||
    p["student-id"] ||
    p.preferred_username ||
    p.sub
  );
}

// --------------------------------------------------
// ================ KEYCLOAK INIT ====================
// --------------------------------------------------

const LOGIN_FLAG_KEY = "ecors-ms1-login-attempted";

// ตัวเลือกตอน init keycloak
const initOptions = {
  onLoad: "check-sso",      // ถ้ามี session อยู่แล้ว ให้ login ให้อัตโนมัติ
  checkLoginIframe: false,  // ปิด iframe check เพื่อลดปัญหา cross-site
  pkceMethod: "S256",       // ใช้ PKCE เพิ่มความปลอดภัย
};

keycloak
  .init(initOptions)
  .then(async (authenticated) => {
    console.log("Keycloak authenticated?", authenticated);

    if (!authenticated) {
      // ป้องกันเข้า loop login ซ้ำ
      const attempted = sessionStorage.getItem(LOGIN_FLAG_KEY);
      if (!attempted) {
        sessionStorage.setItem(LOGIN_FLAG_KEY, "1");
        return keycloak.login({ redirectUri: RESERVE_URL });
      }
      return;
    }

    // login แล้ว → ลบ hash state ออกจาก URL
    cleanUrlAfterLogin();
    sessionStorage.removeItem(LOGIN_FLAG_KEY);

    if (elAuthStatus) elAuthStatus.textContent = "Authenticated";

    // โหลดข้อมูล user + declared-plan
    await loadUserAndDeclaration();

    // เริ่ม refresh token background
    startRefresh();
  })
  .catch((err) => {
    console.error("Keycloak init failed", err);
    const attempted = sessionStorage.getItem(LOGIN_FLAG_KEY);
    if (!attempted) {
      sessionStorage.setItem(LOGIN_FLAG_KEY, "1");
      keycloak.login({ redirectUri: RESERVE_URL });
    } else {
      if (elAuthStatus) elAuthStatus.textContent = "Authentication error";
      showDialog("There is a problem. Please try again later.");
    }
  });


// --------------------------------------------------
// ================ REFRESH TOKEN ====================
// --------------------------------------------------

// ตั้ง interval ให้ต่ออายุ token ทุก ๆ 30 วินาที
function startRefresh() {
  setInterval(() => {
    keycloak.updateToken(60).catch(() =>
      keycloak.login({ redirectUri: RESERVE_URL })
    );
  }, 30_000);
}

/**
 * 🔎 สิ่งที่น่าสนใจและได้เรียนรู้จากการพัฒนาหน้า Reserve / Declare Study Plan
 * =============================================================================
 *
 * 1) การจัดการสถานะการประกาศแผน (Declare / Change / Cancel) แบบครบวงจร
 * --------------------------------------------------------------------------
 * หน้า reserve ไม่ได้เป็นแค่หน้าให้เลือกแผนแล้วกดปุ่มครั้งเดียว แต่ต้องรองรับ
 * วงจรชีวิตของ “สถานะการประกาศแผน” ทั้งหมด โดยผูกกับข้อมูลจริงจาก backend
 * และยังต้องผ่านเงื่อนไขของ Cypress test ด้วย
 *
 * สิ่งที่หน้า Reserve ต้องรองรับ:
 *   - กรณียังไม่เคยประกาศแผน  → โหมด "declare"
 *   - กรณีเคยประกาศแล้ว       → โหมด "change" (ให้เปลี่ยนได้ + ยกเลิกได้)
 *   - กรณีเคยประกาศแล้วและยกเลิกไปแล้ว → ต้องแสดงประวัติการยกเลิก แต่ไม่ให้ dropdown เลือกแผนค้างอยู่
 *
 * เพื่อรองรับสิ่งนี้ เราเก็บสถานะหลัก ๆ ไว้ในตัวแปร:
 *   - let declareMode = "declare"
 *       → ระบุว่า UI ตอนนี้อยู่ในโหมด "declare" หรือ "change"
 *   - let currentDeclaredPlanId = null
 *       → เก็บ planId ของแผนที่ถูกประกาศล่าสุด (ใช้คุม dropdown และปุ่ม Change)
 *   - let currentDeclaredData = null
 *       → เก็บข้อมูลประกาศล่าสุดทั้งก้อน (planCode, nameEng, status, เวลา ฯลฯ)
 */
let declareMode = "declare";       // "declare" | "change"
let currentDeclaredPlanId = null;  // id แผนที่ประกาศล่าสุด
let currentDeclaredData = null;    // เก็บข้อมูลประกาศล่าสุดทั้งก้อน

/**
 * จากนั้นเขียนฟังก์ชัน updateButtonsState() เพื่อคุมปุ่มบนหน้าจอทั้งหมด
 * ให้สัมพันธ์กับสถานะ declareMode / currentDeclaredPlanId / ค่าใน dropdown:
 *
 *   - ถ้า declareMode === "declare"
 *       • แสดงปุ่ม Declare เพียงปุ่มเดียว
 *       • ปุ่ม Declare จะกดได้ต่อเมื่อผู้ใช้เลือกแผนใน dropdown แล้ว (มีค่า selectPlan.value)
 *       • ปุ่ม Change / Cancel จะถูกซ่อน และ disabled เสมอ
 *
 *   - ถ้า declareMode === "change"
 *       • ซ่อนปุ่ม Declare และ disabled
 *       • แสดงปุ่ม Change + Cancel
 *       • ปุ่ม Change จะกดได้เฉพาะกรณี:
 *           - มีการเลือกแผนใน dropdown แล้ว
 *           - currentDeclaredPlanId ไม่เป็น null
 *           - แผนที่เลือกต่างจากแผนที่ประกาศอยู่ตอนนี้ (กันกรณีกดเปลี่ยนแต่เลือกแผนเดิม)
 *       • ปุ่ม Cancel จะถูกแสดงและกดได้ เพื่อเปิด dialog ยืนยันการยกเลิก
 *
 * ฟังก์ชันนี้ร่วมกับ helper:
 *   - showEl(el) / hideEl(el) → จัดการทั้ง class "hidden" และ style.display
 *     เพื่อให้ตรงกับการตรวจของ Cypress ที่เช็กได้ทั้ง visibility และ class
 */
function updateButtonsState() {
  if (!selectPlan) return;
  const hasSelection = !!selectPlan.value;

  if (declareMode === "declare") {
    showEl(btnDeclare);
    btnDeclare.disabled = !hasSelection;

    hideEl(btnChange);
    btnChange.disabled = true;

    hideEl(btnCancel);
    btnCancel.disabled = true;

  } else if (declareMode === "change") {
    hideEl(btnDeclare);
    btnDeclare.disabled = true;

    showEl(btnChange);
    const selectedId = Number(selectPlan.value || "0");
    const isSame =
      currentDeclaredPlanId != null &&
      selectedId === Number(currentDeclaredPlanId);

    btnChange.disabled =
      !hasSelection || currentDeclaredPlanId == null || isSame;

    showEl(btnCancel);
    btnCancel.disabled = false;
  }
}
/**
 * ส่วน loadDeclaration(studentId) ทำหน้าที่แปลงสถานะจาก backend → state ฝั่ง UI:
 *   - ถ้า backend ตอบ 404 → ไม่มีประกาศแผน
 *       • แสดง "Declaration Status: Not Declared"
 *       • เคลียร์ currentDeclaredData / currentDeclaredPlanId
 *       • ตั้ง declareMode = "declare"
 *       • โหลดแผนทั้งหมดใหม่ แล้วเคลียร์ dropdown ให้เริ่มที่ "-- Select Major --"
 *
 *   - ถ้ามีข้อมูลกลับมา → currentDeclaredData = data และ setDeclaredStatus(data)
 *       • อ่านค่า data.status (เช่น "DECLARED" หรือ "CANCELLED")
 *       • ถ้า status === "CANCELLED" → ตั้ง declareMode = "declare"
 *         แต่ยังให้ข้อความบนจอแสดงว่าเคยประกาศและถูกยกเลิกเมื่อไหร่
 *       • ถ้า status !== "CANCELLED" → declareMode = "change"
 *       • currentDeclaredPlanId จะถูกใช้เฉพาะกรณีที่ยังอยู่ในโหมด "change"
 *         เพื่อเลือกค่าใน dropdown ให้ตรงกับแผนที่ประกาศอยู่
 *
 * แนวคิดสำคัญที่ได้จากส่วนนี้:
 *   - ฝึกคิด “state machine” บนหน้าเว็บ ว่าจอเดียว แต่มีหลายสถานะย่อย
 *   - แยก logic การคุมปุ่มและ UI ไว้ในฟังก์ชันกลาง (updateButtonsState)
 *     ทำให้โค้ดอ่านง่าย แก้ที่เดียวแล้วมีผลทุกจุด
 *   - ทำให้สถานะ UI สอดคล้องกับสถานะ backend เสมอ (รวมถึงกรณี CANCELLED)
 *   - เขียนโค้ดให้ Cypress สามารถเทสได้อย่างละเอียด (เช่น สถานะปุ่ม, class, value ใน select)
 *
 */
const data = await res.json();
currentDeclaredData = data;
setDeclaredStatus(data, { recent });

const status = data.status || "DECLARED";
declareMode = status === "CANCELLED" ? "declare" : "change";

const planId = data.planId ?? data.plan_id;

// ถ้า CANCELLED → ไม่ให้ dropdown ค้างค่า
currentDeclaredPlanId =
  declareMode === "change" && planId != null ? Number(planId) : null;

await loadPlans();

if (selectPlan) {
  selectPlan.value =
    currentDeclaredPlanId != null ? String(currentDeclaredPlanId) : "";
}

updateButtonsState();
/**
 * 2) ระบบยกเลิกการประกาศ (Cancel Declaration) + Dialog ยืนยันแบบครบเคส
 * --------------------------------------------------------------------------
 * อีกส่วนที่สำคัญบนหน้า reserve คือฟีเจอร์การ "Cancel Declaration"
 * ที่ไม่ได้เป็นแค่การลบข้อมูล แต่ต้อง:
 *   - แสดง dialog ยืนยันที่มีข้อความอธิบายอย่างละเอียดว่า
 *     ผู้ใช้เคยประกาศแผนอะไร และประกาศเมื่อวันไหน เวลาอะไร
 *   - รองรับปุ่ม 2 แบบใน dialog:
 *       • "Cancel Declaration"  → ยืนยันยกเลิกและยิง DELETE ไป backend
 *       • "Keep Declaration"    → ปิด dialog แล้วคงสถานะเดิมไว้
 *   - จัดการผลลัพธ์จาก backend หลายสถานะ (200, 204, 404, 409)
 *   - อัปเดตสถานะบนหน้าจอให้ตรงกับ requirement ของ PBI6/PBI7 และ Cypress
 *
 * การสร้างข้อความยืนยันใน dialog ใช้ฟังก์ชัน buildCancelMessage():
 *   - ดึง planCode / nameEng / เวลา updatedAt หรือ createdAt จาก currentDeclaredData
 *   - ใช้ formatLocalDateWithZone(isoString) แปลงเวลาในรูป ISO ให้เป็น
 *     รูปแบบ dd/MM/yyyy, HH:mm:ss ตาม timezone ของ browser (เช่น Asia/Bangkok)
 *   - ประกอบเป็นประโยค:
 *       "You have declared DE - Data Engineer as your plan on 25/11/2025, 12:44:28 (Asia/Bangkok). Are you sure you want to cancel this declaration?"
 *     ซึ่งเป็นรูปแบบที่ Cypress คาดหวังแบบตัวอักษรต่ออักษร
 */
function buildCancelMessage() {
  if (!currentDeclaredData) {
    return "Are you sure you want to cancel the declaration?";
  }

  const planCode =
    currentDeclaredData.planCode ??
    currentDeclaredData.plan_code ??
    currentDeclaredData.plan?.planCode ?? "";

  const nameEng =
    currentDeclaredData.nameEng ??
    currentDeclaredData.plan_name_eng ??
    currentDeclaredData.plan?.nameEng ?? "";

  const iso =
    currentDeclaredData.updatedAt ??
    currentDeclaredData.updated_at ??
    currentDeclaredData.createdAt ??
    currentDeclaredData.created_at ??
    new Date().toISOString();

  const whenStr = formatLocalDateWithZone(iso);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  return `You have declared ${planCode} - ${nameEng} as your plan on ${whenStr} (${tz}). Are you sure you want to cancel this declaration?`;
}
/**
 * ในส่วนของ dialog มี 2 โหมดการใช้งานหลัก:
 *   - showDialog(message)
 *       • ใช้สำหรับแจ้งข้อความทั่วไป เช่น error หรือ "Declaration cancelled."
 *       • แสดงปุ่ม OK ปุ่มเดียว โดย resetDialogToOkMode() จะเปิด dialog
 *         ในโหมดที่มีแค่ปุ่ม OK และซ่อนปุ่ม Cancel / Keep
 */
function showDialog(message) {
  if (!dialogEl) {
    alert(message);
    return;
  }
  resetDialogToOkMode();
  dialogMsgEl.textContent = message;
  dialogEl.showModal();
}
/**
 *   - showCancelConfirmDialog(message, onConfirm)
 *       • ใช้ตอนผู้ใช้กดปุ่ม Cancel Declaration บนหน้า reserve
 *       • ซ่อนปุ่ม OK แล้วแสดง 2 ปุ่ม:
 *           - ปุ่ม Cancel Declaration (“ยืนยันยกเลิก”)
 *           - ปุ่ม Keep Declaration (“ไม่ยกเลิกและปิด dialog”)
 *       • ปุ่ม Cancel Declaration จะไปเรียก onConfirm()
 *         ซึ่งเชื่อมกับฟังก์ชัน doCancelDeclaration()
 *       • ปุ่ม Keep Declaration แค่ dialogEl.close() โดยไม่เรียก API อะไรเพิ่ม
 */
function showCancelConfirmDialog(message, onConfirm) {
  if (!dialogEl) {
    const yes = confirm(message);
    if (yes && typeof onConfirm === "function") onConfirm();
    return;
  }

  dialogMsgEl.textContent = message;

  // ซ่อน OK
  btnDialogOk?.classList.add("hidden");
  btnDialogOk && (btnDialogOk.disabled = true);

  // โชว์ปุ่ม Cancel Declaration + Keep Declaration
  btnDialogCancel?.classList.add("ecors-button-cancel");
  btnDialogCancel?.classList.remove("hidden");
  btnDialogKeep?.classList.remove("hidden");
  btnDialogCancel && (btnDialogCancel.disabled = false);
  btnDialogKeep && (btnDialogKeep.disabled = false);

  // reset handler กันซ้อน
  if (btnDialogCancel) btnDialogCancel.onclick = null;
  if (btnDialogKeep) btnDialogKeep.onclick = null;

  btnDialogCancel.onclick = async () => {
    dialogEl.close();
    if (typeof onConfirm === "function") await onConfirm();
  };

  btnDialogKeep.onclick = () => {
    dialogEl.close();
  };

  dialogEl.showModal();
}
/**
 * ฟังก์ชัน doCancelDeclaration() คือหัวใจของการยกเลิกประกาศ:
 *   - ยิง DELETE ไปที่ `${API_BASE}/students/${studentId}/declared-plan`
 *   - แยกการจัดการตาม status code:
 *       • 200 → ได้ข้อมูล cancellation กลับมา
 *           - เก็บ currentDeclaredData = data
 *           - ใช้ setDeclaredStatus(data) ให้ข้อความบนจอจำเวลายกเลิกจาก server จริง
 *           - ตั้ง declareMode = "declare" และปรับ dropdown + ปุ่มใหม่
 *           - แสดง dialog "Declaration cancelled."
 *
 *       • 204 → ลบสำเร็จแต่ไม่มี body
 *           - เคลียร์ currentDeclaredData / currentDeclaredPlanId
 *           - แสดง "Declaration Status: Not Declared"
 *           - กลับไปโหมด declare และรีเฟรช dropdown
 *
 *       • 404 → ไม่มี declared plan ให้ยกเลิก
 *           - เคลียร์ state บน UI เหมือนกรณีไม่มีข้อมูล
 *           - แสดงข้อความ "No declared plan found for student with id=..."
 *
 *       • 409 (เช่น CANCELLED_DECLARED_PLAN)
 *           - แสดงข้อความตาม requirement เช่น
 *             "Cannot cancel the declared plan because it is already cancelled."
 *           - แล้วเรียก loadDeclaration(studentId) เพื่อ sync UI ให้ตรงกับข้อมูลปัจจุบัน
 *
 *   - ในทุกกรณีจะมีส่วน finally ที่:
 *       • ปลด lock ปุ่ม Cancel (btnCancel.disabled = false)
 *       • เรียก updateButtonsState() เพื่อให้ปุ่มบนหน้าจอ update ตาม state ล่าสุด
 */
async function doCancelDeclaration() {
  const studentId = getStudentId();
  if (!studentId) return;

  btnCancel.disabled = true;

  try {
    const res = await fetch(
      `${API_BASE}/students/${studentId}/declared-plan`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    if (res.status === 200) {
      const data = await res.json().catch(() => ({}));
      currentDeclaredData = data;

      setDeclaredStatus(data); // ใช้เวลาจาก updatedAt ของ server

      declareMode = "declare";
      currentDeclaredPlanId = Number(
        data.planId ?? data.plan_id ?? currentDeclaredPlanId
      );

      await loadPlans();
      updateButtonsState();
      showSection();

      showDialog("Declaration cancelled.");
      return;
    }

    if (res.status === 204) {
      currentDeclaredData = null;
      currentDeclaredPlanId = null;
      if (elDeclared) elDeclared.textContent = "Declaration Status: Not Declared";

      declareMode = "declare";
      await loadPlans();
      updateButtonsState();
      showSection();

      showDialog("Declaration cancelled.");
      return;
    }

    if (res.status === 404) {
      currentDeclaredData = null;
      currentDeclaredPlanId = null;
      if (elDeclared) elDeclared.textContent = "Declaration Status: Not Declared";

      declareMode = "declare";
      await loadPlans();
      updateButtonsState();
      showSection();

      showDialog(`No declared plan found for student with id=${studentId}.`);
      return;
    }

    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body.error === "CANCELLED_DECLARED_PLAN") {
        showDialog(
          "Cannot cancel the declared plan because it is already cancelled."
        );
        await loadDeclaration(studentId);
      } else {
        showDialog("There is a problem. Please try again later.");
      }
      return;
    }

    showDialog("There is a problem. Please try again later.");
  } catch (err) {
    console.error(err);
    showDialog("There is a problem. Please try again later.");
  } finally {
    btnCancel.disabled = false;
    updateButtonsState();
  }
}
/**
 * สิ่งที่ได้จากส่วนนี้:
 *   - ฝึกการออกแบบ UX ในขั้นตอน “ยืนยันการยกเลิก” ให้ผู้ใช้รู้ว่า
 *     กำลังจะลบข้อมูลอะไร ที่เคยเลือกไว้เมื่อไหร่ ไม่ใช่ลบแบบมืด ๆ
 *   - ฝึกการจัดการ error หลายแบบจาก backend ในระดับ frontend
 *     โดยให้ข้อความที่เข้าใจง่าย และ sync สถานะของ UI ให้ถูกต้อง
 *   - เรียนรู้การเขียนโค้ดที่ “test-friendly” คือ Cypress สามารถ assert ได้ทั้งข้อความ
 *     เวลา, ปุ่ม, สถานะ และค่าใน dropdown ได้อย่างแม่นยำ
 */
