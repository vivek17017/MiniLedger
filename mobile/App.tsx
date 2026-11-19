
import React, { useCallback, useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api,
  API_BASE_URL,
  Loan,
  Summary,
  uploadReceiptImage,
  ReceiptUploadResult, } from "./src/api";

type User = { id: string; phone: string };
type LoginResult = { token: string; user: User };

export default function App() {
  const [phone, setPhone] = useState("");
  const [selectedReceipts, setSelectedReceipts] =
  useState<Record<string, string>>({});

const [uploadingReceiptId, setUploadingReceiptId] =
  useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);

  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalLent: 0,
    totalRepaid: 0,
    overdueAmount: 0,
  });

  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;

    try {
      const [loanData, summaryData] = await Promise.all([
        api<Loan[]>("/api/loans", { token }),
        api<Summary>("/api/summary", { token }),
      ]);

      setLoans(loanData);
      setSummary(summaryData);
    } catch (error) {
      Alert.alert(
        "Could not load data",
        error instanceof Error ? error.message : "Please try again."
      );
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sendOtp() {
    if (!/^\+?[1-9]\d{7,14}$/.test(phone.trim())) {
      Alert.alert("Invalid phone", "Enter a valid phone number with country code.");
      return;
    }

    setLoading(true);
    try {
      await api("/api/auth/send-otp", {
        method: "POST",
        body: { phone: phone.trim() },
      });
      setOtpSent(true);
      Alert.alert("OTP requested", "Check the backend terminal for the OTP.");
    } catch (error) {
      Alert.alert("Login error", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setLoading(true);
    try {
      const result = await api<LoginResult>("/api/auth/demo", {
        method: "POST",
      });
      setUser(result.user);
      setToken(result.token);
      setOtp("");
      setOtpSent(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      Alert.alert("Demo login failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp)) {
      Alert.alert("Invalid OTP", "Enter the six-digit code.");
      return;
    }

    setLoading(true);
    try {
      const result = await api<LoginResult>("/api/auth/verify-otp", {
        method: "POST",
        body: { phone: phone.trim(), otp },
      });

      setToken(result.token);
      setUser(result.user);
      setOtp("");
    } catch (error) {
      Alert.alert("Login failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function addLoan() {
    const cleanName = friendName.trim();
    const parsedAmount = Number(amount);

    if (!cleanName || cleanName.length > 100) {
      Alert.alert("Invalid name", "Enter a name up to 100 characters.");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter a positive amount.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)) ||
        new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate) {
      Alert.alert("Invalid date", "Enter a real date in YYYY-MM-DD format.");
      return;
    }

    setLoading(true);
    try {
      await api<Loan>("/api/loans", {
        method: "POST",
        token,
        body: {
          friendName: cleanName,
          amount: parsedAmount,
          dueDate,
        },
      });

      setFriendName("");
      setAmount("");
      setDueDate("");
      await refresh();
      Alert.alert("Success", "Loan entry added.");
    } catch (error) {
      Alert.alert("Could not add loan", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function markRepaid(loan: Loan) {
    try {
      await api<Loan>(`/api/loans/${loan.id}/repay`, {
        method: "PATCH",
        token,
      });
      await refresh();
    } catch (error) {
      Alert.alert("Could not update loan", String(error));
    }
  }
  
async function chooseReceipt(loanId: string) {
  try {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Allow photo library access to select a receipt."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    setSelectedReceipts((previous) => ({
      ...previous,
      [loanId]: result.assets[0].uri,
    }));
  } catch (error) {
    Alert.alert(
      "Could not select image",
      error instanceof Error ? error.message : "Please try again."
    );
  }
}

async function uploadReceipt(loan: Loan) {
  const imageUri = selectedReceipts[loan.id];

  if (!imageUri) {
    Alert.alert("Select a photo", "Choose a receipt image first.");
    return;
  }

  setUploadingReceiptId(loan.id);

  try {
    await uploadReceiptImage<ReceiptUploadResult>(
      `/api/loans/${loan.id}/receipt`,
      token,
      imageUri
    );

    setSelectedReceipts((previous) => {
      const next = { ...previous };
      delete next[loan.id];
      return next;
    });

    await refresh();

    Alert.alert("Success", "Receipt uploaded successfully.");
  } catch (error) {
    Alert.alert(
      "Upload failed",
      error instanceof Error ? error.message : "Please try again."
    );
  } finally {
    setUploadingReceiptId(null);
  }
}


  function logout() {
    setToken("");
    setUser(null);
    setLoans([]);
    setSummary({ totalLent: 0, totalRepaid: 0, overdueAmount: 0 });
    setOtpSent(false);
    setOtp("");
  }

  const isOverdue = (loan: Loan) =>
    !loan.repaid &&
    new Date(loan.dueDate).getTime() <
      new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();

  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.login}>
          <Text style={styles.brand}>MiniLedger</Text>
          <Text style={styles.subtitle}>Keep track of money lent to friends.</Text>

          <Text style={styles.label}>Phone number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+919876543210"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          {otpSent && (
            <>
              <Text style={styles.label}>Mock OTP</Text>
              <TextInput
                style={styles.input}
                value={otp}
                onChangeText={setOtp}
                placeholder="Enter six-digit OTP"
                keyboardType="number-pad"
                maxLength={6}
              />
            </>
          )}

          <Pressable
            style={styles.button}
            onPress={otpSent ? verifyOtp : sendOtp}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Please wait..." : otpSent ? "Verify OTP" : "Send OTP"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.demoButton}
            onPress={() => void handleDemoLogin()}
            disabled={loading}
          >
            <Text style={styles.demoButtonText}>Try Demo</Text>
          </Pressable>
          {loading && <ActivityIndicator />}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>MiniLedger</Text>
            <Text style={styles.subtitle}>{user?.phone}</Text>
          </View>
          <Pressable onPress={logout}>
            <Text style={styles.link}>Log out</Text>
          </Pressable>
        </View>

        <Text style={styles.heading}>Your money overview</Text>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total lent</Text>
          <Text style={styles.total}>₹{summary.totalLent.toFixed(2)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Repaid</Text>
              <Text style={styles.repaid}>
                ₹{summary.totalRepaid.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Overdue</Text>
              <Text style={styles.overdueAmount}>
                ₹{summary.overdueAmount.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.heading}>Add a loan</Text>
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={friendName}
            onChangeText={setFriendName}
            placeholder="Friend's name"
            maxLength={100}
          />
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount (₹)"
            keyboardType="decimal-pad"
          />
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="Due date (YYYY-MM-DD)"
          />
          <Pressable style={styles.button} onPress={addLoan} disabled={loading}>
            <Text style={styles.buttonText}>Add loan</Text>
          </Pressable>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.heading}>Your entries</Text>
          <Pressable onPress={() => void refresh()}>
            <Text style={styles.link}>Refresh</Text>
          </Pressable>
        </View>

        {loans.length === 0 ? (
          <Text style={styles.empty}>No loans yet. Add your first entry above.</Text>
        ) : (
          loans.map((loan) => {
            const overdue = isOverdue(loan);

            return (
              <View
                key={loan.id}
                style={[
                  styles.loanCard,
                  overdue && styles.overdueCard,
                ]}
              >
                <View style={styles.loanTop}>
                  <Text style={styles.friend}>{loan.friendName}</Text>
                  <Text style={styles.loanAmount}>
                    ₹{Number(loan.amount).toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.loanMeta}>
                  Due: {new Date(loan.dueDate).toISOString().slice(0, 10)}
                </Text>
                <Text style={[
                  styles.status,
                  overdue && styles.overdueText,
                ]}>
                  {loan.repaid ? "REPAID" : overdue ? "OVERDUE" : "OUTSTANDING"}
                </Text>
                
{/* Receipt photo preview */}
{(selectedReceipts[loan.id] || loan.receiptUrl) && (
  <Image
    source={{
      uri: selectedReceipts[loan.id]
        ? selectedReceipts[loan.id]
        : `${API_BASE_URL}${loan.receiptUrl}`,
    }}
    style={styles.receiptPreview}
    resizeMode="contain"
  />
)}

{/* Choose or replace receipt photo */}
<Pressable
  style={styles.smallButton}
  onPress={() => void chooseReceipt(loan.id)}
  disabled={uploadingReceiptId === loan.id}
>
  <Text style={styles.buttonText}>
    {selectedReceipts[loan.id]
      ? "Change receipt photo"
      : loan.receiptUrl
        ? "Replace receipt photo"
        : "Choose receipt photo"}
  </Text>
</Pressable>

{/* Upload selected receipt */}
{selectedReceipts[loan.id] && (
  <Pressable
    style={styles.smallButton}
    onPress={() => void uploadReceipt(loan)}
    disabled={uploadingReceiptId === loan.id}
  >
    <Text style={styles.buttonText}>
      {uploadingReceiptId === loan.id
        ? "Uploading..."
        : "Upload receipt"}
    </Text>
  </Pressable>
)}


                {!loan.repaid && (
                  <Pressable
                    style={styles.smallButton}
                    onPress={() => void markRepaid(loan)}
                  >
                    <Text style={styles.buttonText}>Mark as repaid</Text>
                    
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  demoButton: {
    marginTop: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "#356B57",
    borderRadius: 10,
    alignItems: "center",
  },
  demoButtonText: {
    color: "#356B57",
    fontWeight: "700",
    fontSize: 16,
  },
  container: { flex: 1, backgroundColor: "#F5F7FB" },
  content: { padding: 20, paddingBottom: 40 },
  login: { flex: 1, justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  brand: { fontSize: 28, fontWeight: "800", color: "#173F35" },
  subtitle: { fontSize: 13, color: "#687581", marginTop: 4 },
  heading: {
    fontSize: 19,
    fontWeight: "700",
    color: "#1B2935",
    marginBottom: 12,
    marginTop: 10,
  },
  summaryCard: {
    backgroundColor: "#173F35",
    borderRadius: 18,
    padding: 20,
    marginBottom: 22,
  },
  summaryLabel: { fontSize: 13, color: "#C9DED5" },
  total: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    marginVertical: 8,
  },
  summaryRow: { flexDirection: "row", gap: 28, marginTop: 12 },
  summaryItem: { flex: 1 },
  repaid: { color: "#9EE5B4", fontSize: 17, fontWeight: "700", marginTop: 6 },
  overdueAmount: {
    color: "#FFC1B8",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 6,
  },
  form: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    gap: 10,
    marginBottom: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DCE3E8",
    backgroundColor: "#FFFFFF",
    padding: 13,
    borderRadius: 10,
    fontSize: 15,
    color: "#1B2935",
  },
  label: { fontWeight: "600", color: "#34454F", marginBottom: 6 },
  button: {
    backgroundColor: "#216E56",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
  link: { color: "#216E56", fontWeight: "700" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loanCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E1E7EB",
  },
  overdueCard: {
    backgroundColor: "#FFF1EF",
    borderColor: "#E9A29A",
  },
  loanTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  friend: { fontSize: 17, fontWeight: "700", color: "#23353F" },
  loanAmount: { fontSize: 17, fontWeight: "800", color: "#173F35" },
  loanMeta: { color: "#697782", marginTop: 8 },
  status: {
    fontSize: 12,
    fontWeight: "800",
    color: "#216E56",
    marginTop: 10,
  },
  overdueText: { color: "#B42318" },
  smallButton: {
    backgroundColor: "#216E56",
    padding: 10,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 12,
  },
  empty: { color: "#687581", marginVertical: 20 },
  receiptPreview: {
  width: "100%",
  height: 180,
  marginTop: 12,
  marginBottom: 8,
  backgroundColor: "#F0F2F4",
  borderRadius: 10,
},
});
